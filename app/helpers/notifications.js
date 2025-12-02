const nodemailer = require('nodemailer');
const twilio = require('twilio');
const db = require("../models");

// Check if notifications are enabled via environment variables
const EMAIL_ENABLED = process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true';
const SMS_ENABLED = process.env.ENABLE_SMS_NOTIFICATIONS === 'true';
const SALON_KEY = process.env.SALON_KEY || 1;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

console.log('📧 Email notifications:', EMAIL_ENABLED ? 'ENABLED' : 'DISABLED');
console.log('📱 SMS notifications:', SMS_ENABLED ? 'ENABLED' : 'DISABLED');
console.log('🏢 Salon Key:', SALON_KEY);
console.log('🌐 Frontend URL:', FRONTEND_URL);

// Email transporter (only initialize if enabled)
let emailTransporter = null;
if (EMAIL_ENABLED) {
    try {
        emailTransporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        console.log('✅ Email transporter initialized');
    } catch (err) {
        console.error('❌ Failed to initialize email transporter:', err.message);
    }
}

// Twilio client (only initialize if enabled)
let twilioClient = null;
if (SMS_ENABLED) {
    try {
        twilioClient = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );
        console.log('✅ Twilio client initialized');
    } catch (err) {
        console.error('❌ Failed to initialize Twilio client:', err.message);
    }
}

/**
 * Get salon information from database by salon key
 */
async function getSalonInfo() {
    try {
        const salon = await db.sequelize.query(
            `SELECT name, email, phone, photo, photobase64 
             FROM tblsalon 
             WHERE pkey = :salonkey AND dateinactivated IS NULL 
             LIMIT 1`,
            {
                replacements: { salonkey: SALON_KEY },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        if (salon && salon.length > 0) {
            console.log('✅ Salon info loaded:', salon[0].name);
            return {
                name: salon[0].name || 'Your Salon',
                email: salon[0].email || process.env.SMTP_USER,
                phone: salon[0].phone || '',
                photo: salon[0].photo || '',
                photobase64: salon[0].photobase64 || ''
            };
        }

        console.log('⚠️ No salon found with key:', SALON_KEY);
        // Return default if no salon found
        return {
            name: 'Your Salon',
            email: process.env.SMTP_USER,
            phone: '',
            photo: '',
            photobase64: ''
        };
    } catch (err) {
        console.error('❌ Error fetching salon info:', err);
        return {
            name: 'Your Salon',
            email: process.env.SMTP_USER,
            phone: '',
            photo: '',
            photobase64: ''
        };
    }
}

/**
 * Get booking-related settings from tblsetting for the salon
 * Returns { autoconfirm: boolean, salon_email: string }
 */
exports.getBookingSettings = async (pkey) => {
    // allow overriding the pkey (default to 1)
    const settingPkey = typeof pkey !== 'undefined' ? Number(pkey) : Number(process.env.SETTING_PKEY || 1);
    try {
        const rows = await db.sequelize.query(
            `SELECT * FROM tblsetting WHERE 1 LIMIT 1`,
            { replacements: { pkey: settingPkey }, type: db.sequelize.QueryTypes.SELECT }
        );

        const result = { autoconfirm: true, salon_email: null };

        if (Array.isArray(rows) && rows.length > 0) {
            const r = rows[0];

            // Direct column names (preferred): autoconfirm, salon_email, email
            if (typeof r.autoconfirm !== 'undefined') {
                const v = String(r.autoconfirm).toLowerCase();
                result.autoconfirm = (v === 'true' || v === '1' || v === 'yes' || v === 'on');
            } else if (typeof r.auto_confirm !== 'undefined') {
                const v = String(r.auto_confirm).toLowerCase();
                result.autoconfirm = (v === 'true' || v === '1' || v === 'yes' || v === 'on');
            }

            if (typeof r.salon_email !== 'undefined' && r.salon_email) {
                result.salon_email = r.salon_email;
            } else if (typeof r.email !== 'undefined' && r.email) {
                result.salon_email = r.email;
            }

            // If table stores a JSON blob in a value column, try parsing it
            if (!result.salon_email && typeof r.settingvalue === 'string' && r.settingvalue.trim()) {
                try {
                    const parsed = JSON.parse(r.settingvalue);
                    if (parsed) {
                        if (typeof parsed.autoconfirm !== 'undefined') {
                            const v = String(parsed.autoconfirm).toLowerCase();
                            result.autoconfirm = (v === 'true' || v === '1' || v === 'yes' || v === 'on');
                        }
                        if (parsed.salon_email) result.salon_email = parsed.salon_email;
                        if (!result.salon_email && parsed.email) result.salon_email = parsed.email;
                    }
                } catch (e) {
                    // not JSON - ignore
                }
            }
        }

        // fallback to salon info email
        if (!result.salon_email) {
            const salon = await getSalonInfo();
            result.salon_email = salon.email;
        }

        return result;
    } catch (err) {
        console.error('❌ Error fetching booking settings by pkey:', err);
        const salon = await getSalonInfo();
        return { autoconfirm: true, salon_email: salon.email };
    }
};

/**
 * Send an approval-request email to the salon owner when autoconfirm is disabled
 * bookingData: { bookingkey, customername, customeremail, customerphone, datetime, servicename, staffname, token }
 */
exports.sendBookingApprovalRequestEmail = async (bookingData) => {
    if (!EMAIL_ENABLED) {
        console.log('⚠️ Email notifications are disabled');
        return { success: false, reason: 'Email notifications disabled' };
    }

    if (!emailTransporter) {
        console.log('⚠️ Email transporter not initialized');
        return { success: false, reason: 'Email transporter not configured' };
    }

    try {
        const { bookingkey, customername, customeremail, customerphone, datetime, servicename, staffname, token } = bookingData;

        const settings = await exports.getBookingSettings();
        const toEmail = settings.salon_email;
        if (!toEmail) {
            console.log('⚠️ No salon email configured, skipping owner approval email');
            return { success: false, reason: 'No salon email' };
        }

        const salon = await getSalonInfo();

        const logoHtml = salon.photobase64
            ? `<img src="data:image/png;base64,${salon.photobase64}" alt="${salon.name}" style="max-width: 200px; margin-bottom: 20px;">`
            : salon.photo
                ? `<img src="${salon.photo}" alt="${salon.name}" style="max-width: 200px; margin-bottom: 20px;">`
                : '';

        const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
        const confirmUrl = `${backendUrl}/api/booking/owner/confirm?bookingkey=${bookingkey}&token=${encodeURIComponent(token || '')}`;
        const cancelUrl = `${backendUrl}/api/booking/owner/cancel?bookingkey=${bookingkey}&token=${encodeURIComponent(token || '')}`;
        const viewUrl = `${backendUrl}/api/booking/email-view?bookingkey=${bookingkey}&token=${encodeURIComponent(token || '')}`;

        const buttonsHtml = `
                        <div style="text-align:center;margin:30px 0;">
                            <a href="${confirmUrl}" style="display:inline-block;background-color:#4CAF50;color:white;padding:12px 30px;text-decoration:none;border-radius:5px;margin:5px;font-weight:bold;">✅ Confirm Booking</a>
                            <a href="${cancelUrl}" style="display:inline-block;background-color:#F44336;color:white;padding:12px 30px;text-decoration:none;border-radius:5px;margin:5px;font-weight:bold;">❌ Cancel Booking</a>
                        </div>
                `;

        const mailOptions = {
            from: process.env.SMTP_FROM || `"${salon.name}" <${salon.email}>`,
            to: toEmail,
            subject: `Booking Approval Required - ${salon.name}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
          ${logoHtml}
          <h2 style="color: #333; border-bottom: 2px solid #FF9800; padding-bottom: 10px;">Booking Requires Approval</h2>
          <p>A new booking has been created and requires your confirmation.</p>

          <div style="background-color:#fff9e6;padding:20px;border-radius:6px;margin:20px 0;border-left:4px solid #FFB300;">
            <p style="margin:10px 0;"><strong>Booking ID:</strong> #${bookingkey}</p>
            <p style="margin:10px 0;"><strong>Customer:</strong> ${customername || 'Guest'} (${customeremail || 'no-email'})</p>
            <p style="margin:10px 0;"><strong>Phone:</strong> ${customerphone || 'N/A'}</p>
            <p style="margin:10px 0;"><strong>Service:</strong> ${servicename || 'N/A'}</p>
            <p style="margin:10px 0;"><strong>Staff:</strong> ${staffname || 'N/A'}</p>
            <p style="margin:10px 0;"><strong>Date & Time:</strong> ${datetime || 'N/A'}</p>
          </div>

          ${buttonsHtml}

          <p style="color:#666;">If you have any questions, contact ${salon.name}.</p>
          <hr style="margin:30px 0;border:none;border-top:1px solid #ddd;">
          <p style="color:#999;font-size:12px;text-align:center;">This is an automated message.</p>
        </div>
      `
        };

        const info = await emailTransporter.sendMail(mailOptions);
        console.log('✅ Approval request email sent to owner:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (err) {
        console.error('❌ Approval request email error:', err);
        return { success: false, error: err.message };
    }
};


/**
 * Generate action buttons HTML using backend URLs
 */
function getActionButtons(bookingkey, token, showCancel = true, showChange = true) {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';

    // ✅ Cancel button goes directly to backend (no confirmation needed)
    const cancelUrl = `${backendUrl}/api/booking/email-cancel?bookingkey=${bookingkey}&token=${encodeURIComponent(token)}`;

    // Change and view redirect to Flutter app
    const changeUrl = `${backendUrl}/api/booking/email-modify?bookingkey=${bookingkey}&token=${encodeURIComponent(token)}`;
    const viewUrl = `${backendUrl}/api/booking/email-view?bookingkey=${bookingkey}&token=${encodeURIComponent(token)}`;

    let buttonsHtml = '<div style="text-align: center; margin: 30px 0;">';

    if (showChange) {
        buttonsHtml += `
            <a href="${changeUrl}" style="display: inline-block; background-color: #FF9800; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 5px; font-weight: bold;">
                📝 Change Booking
            </a>
        `;
    }

    if (showCancel) {
        buttonsHtml += `
            <a href="${cancelUrl}" style="display: inline-block; background-color: #F44336; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 5px; font-weight: bold;">
                ❌ Cancel Booking
            </a>
        `;
    }

    buttonsHtml += '</div>';

    return buttonsHtml;
}

/**
 * Send booking confirmation email
 */
exports.sendBookingEmail = async (bookingData) => {
    if (!EMAIL_ENABLED) {
        console.log('⚠️ Email notifications are disabled');
        return { success: false, reason: 'Email notifications disabled' };
    }

    if (!emailTransporter) {
        console.log('⚠️ Email transporter not initialized');
        return { success: false, reason: 'Email transporter not configured' };
    }

    try {
        const { customeremail, customername, datetime, servicename, staffname, bookingkey, token } = bookingData;

        if (!customeremail) {
            console.log('⚠️ No email provided, skipping email notification');
            return { success: false, reason: 'No email provided' };
        }

        const salon = await getSalonInfo();

        const logoHtml = salon.photobase64
            ? `<img src="data:image/png;base64,${salon.photobase64}" alt="${salon.name}" style="max-width: 200px; margin-bottom: 20px;">`
            : salon.photo
                ? `<img src="${salon.photo}" alt="${salon.name}" style="max-width: 200px; margin-bottom: 20px;">`
                : '';

        const actionButtons = token ? getActionButtons(bookingkey, token, true, true) : '';

        const mailOptions = {
            from: process.env.SMTP_FROM || `"${salon.name}" <${salon.email}>`,
            to: customeremail,
            subject: `Booking Confirmation - ${salon.name}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          ${logoHtml}
          <h2 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
            Booking Confirmation
          </h2>
          <p>Dear ${customername || 'Valued Customer'},</p>
          <p>Your booking has been confirmed! We look forward to seeing you.</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 10px 0;"><strong>Booking ID:</strong> #${bookingkey}</p>
            <p style="margin: 10px 0;"><strong>Service:</strong> ${servicename}</p>
            <p style="margin: 10px 0;"><strong>Staff:</strong> ${staffname}</p>
            <p style="margin: 10px 0;"><strong>Date & Time:</strong> ${datetime}</p>
          </div>
          
          ${actionButtons}
          
          <p style="color: #666;">
            <strong>Important:</strong> If you need to reschedule or cancel, please use the buttons above or contact us at least 24 hours in advance.
          </p>
          
          <p>Thank you for choosing ${salon.name}!</p>
          
          ${salon.phone ? `<p style="color: #666;">📞 Contact us: ${salon.phone}</p>` : ''}
          ${salon.email ? `<p style="color: #666;">📧 Email: ${salon.email}</p>` : ''}
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message. Please do not reply directly to this email.
          </p>
        </div>
      `
        };

        const info = await emailTransporter.sendMail(mailOptions);
        console.log('✅ Email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Email send error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send booking modification email
 */
exports.sendBookingModificationEmail = async (bookingData) => {
    if (!EMAIL_ENABLED) {
        console.log('⚠️ Email notifications are disabled');
        return { success: false, reason: 'Email notifications disabled' };
    }

    if (!emailTransporter) {
        console.log('⚠️ Email transporter not initialized');
        return { success: false, reason: 'Email transporter not configured' };
    }

    try {
        const { customeremail, customername, datetime, servicename, staffname, bookingkey, token } = bookingData;

        if (!customeremail) {
            console.log('⚠️ No email provided, skipping email notification');
            return { success: false, reason: 'No email provided' };
        }

        const salon = await getSalonInfo();

        const logoHtml = salon.photobase64
            ? `<img src="data:image/png;base64,${salon.photobase64}" alt="${salon.name}" style="max-width: 200px; margin-bottom: 20px;">`
            : salon.photo
                ? `<img src="${salon.photo}" alt="${salon.name}" style="max-width: 200px; margin-bottom: 20px;">`
                : '';

        const actionButtons = token ? getActionButtons(bookingkey, token, true, true) : '';

        const mailOptions = {
            from: process.env.SMTP_FROM || `"${salon.name}" <${salon.email}>`,
            to: customeremail,
            subject: `Booking Modified - ${salon.name}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          ${logoHtml}
          <h2 style="color: #FF9800; border-bottom: 2px solid #FF9800; padding-bottom: 10px;">
            Booking Modified
          </h2>
          <p>Dear ${customername || 'Valued Customer'},</p>
          <p>Your booking has been successfully updated.</p>
          
          <div style="background-color: #FFF3E0; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #FF9800;">
            <p style="margin: 10px 0;"><strong>Booking ID:</strong> #${bookingkey}</p>
            <p style="margin: 10px 0;"><strong>New Service:</strong> ${servicename}</p>
            <p style="margin: 10px 0;"><strong>New Staff:</strong> ${staffname}</p>
            <p style="margin: 10px 0;"><strong>New Date & Time:</strong> ${datetime}</p>
          </div>
          
          ${actionButtons}
          
          <p style="color: #666;">
            <strong>Note:</strong> If you need to make further changes or cancel, please use the buttons above or contact us at least 24 hours in advance.
          </p>
          
          <p>Thank you for choosing ${salon.name}!</p>
          
          ${salon.phone ? `<p style="color: #666;">📞 Contact us: ${salon.phone}</p>` : ''}
          ${salon.email ? `<p style="color: #666;">📧 Email: ${salon.email}</p>` : ''}
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message. Please do not reply directly to this email.
          </p>
        </div>
      `
        };

        const info = await emailTransporter.sendMail(mailOptions);
        console.log('✅ Modification email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Email send error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send booking cancellation email when customer cancels (from booking confirmation email)
 * bookingData: { customeremail, customername, datetime, servicename, staffname, bookingkey }
 */
exports.sendCustomerCancelledBookingEmail = async (bookingData) => {
    if (!EMAIL_ENABLED) {
        console.log('⚠️ Email notifications are disabled');
        return { success: false, reason: 'Email notifications disabled' };
    }

    if (!emailTransporter) {
        console.log('⚠️ Email transporter not initialized');
        return { success: false, reason: 'Email transporter not configured' };
    }

    try {
        const { customeremail, customername, datetime, servicename, staffname, bookingkey } = bookingData;

        if (!customeremail) {
            console.log('⚠️ No email provided, skipping email notification');
            return { success: false, reason: 'No email provided' };
        }

        const salon = await getSalonInfo();

        const logoHtml = salon.photobase64
            ? `<img src="data:image/png;base64,${salon.photobase64}" alt="${salon.name}" style="max-width: 200px; margin-bottom: 20px;">`
            : salon.photo
                ? `<img src="${salon.photo}" alt="${salon.name}" style="max-width: 200px; margin-bottom: 20px;">`
                : '';

        const bookAgainUrl = `${FRONTEND_URL}/booking`;

        const mailOptions = {
            from: process.env.SMTP_FROM || `"${salon.name}" <${salon.email}>`,
            to: customeremail,
            subject: `Booking Cancelled - ${salon.name}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          ${logoHtml}
          <h2 style="color: #F44336; border-bottom: 2px solid #F44336; padding-bottom: 10px;">
            Booking Cancelled
          </h2>
          <p>Dear ${customername || 'Valued Customer'},</p>
          <p>Your booking has been cancelled as requested.</p>
          
          <div style="background-color: #FFEBEE; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #F44336;">
            <p style="margin: 10px 0;"><strong>Booking ID:</strong> #${bookingkey}</p>
            <p style="margin: 10px 0;"><strong>Service:</strong> ${servicename}</p>
            <p style="margin: 10px 0;"><strong>Staff:</strong> ${staffname}</p>
            <p style="margin: 10px 0;"><strong>Date & Time:</strong> ${datetime}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${bookAgainUrl}" style="display: inline-block; background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                📅 Book Again
            </a>
          </div>
          
          <p style="color: #666;">
            We're sorry to see you cancel. If you'd like to reschedule, we'd be happy to help you find a new time.
          </p>
          
          <p>We hope to see you again soon!</p>
          
          ${salon.phone ? `<p style="color: #666;">📞 Contact us: ${salon.phone}</p>` : ''}
          ${salon.email ? `<p style="color: #666;">📧 Email: ${salon.email}</p>` : ''}
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message. Please do not reply directly to this email.
          </p>
        </div>
      `
        };

        const info = await emailTransporter.sendMail(mailOptions);
        console.log('✅ Customer cancellation email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Email send error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Backward compatibility: alias for sendCustomerCancelledBookingEmail
 * @deprecated Use sendCustomerCancelledBookingEmail instead
 */
exports.sendBookingCancellationEmail = exports.sendCustomerCancelledBookingEmail;

/**
 * Send booking confirmation SMS
 */
exports.sendBookingSMS = async (bookingData) => {
    if (!SMS_ENABLED) {
        console.log('⚠️ SMS notifications are disabled');
        return { success: false, reason: 'SMS notifications disabled' };
    }

    if (!twilioClient) {
        console.log('⚠️ Twilio client not initialized');
        return { success: false, reason: 'Twilio client not configured' };
    }

    try {
        const { customerphone, customername, datetime, servicename, bookingkey } = bookingData;

        if (!customerphone) {
            console.log('⚠️ No phone provided, skipping SMS notification');
            return { success: false, reason: 'No phone provided' };
        }

        const salon = await getSalonInfo();

        let formattedPhone = String(customerphone).trim();
        if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+1' + formattedPhone.replace(/\D/g, '');
        }

        const message = await twilioClient.messages.create({
            body: `Hi ${customername || 'there'}! Your booking (#${bookingkey}) for ${servicename} on ${datetime} is confirmed. See you soon! - ${salon.name}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: formattedPhone
        });

        console.log('✅ SMS sent:', message.sid);
        return { success: true, sid: message.sid };
    } catch (error) {
        console.error('❌ SMS send error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send booking modification SMS
 */
exports.sendBookingModificationSMS = async (bookingData) => {
    if (!SMS_ENABLED) {
        console.log('⚠️ SMS notifications are disabled');
        return { success: false, reason: 'SMS notifications disabled' };
    }

    if (!twilioClient) {
        console.log('⚠️ Twilio client not initialized');
        return { success: false, reason: 'Twilio client not configured' };
    }

    try {
        const { customerphone, customername, datetime, servicename, bookingkey } = bookingData;

        if (!customerphone) {
            console.log('⚠️ No phone provided, skipping SMS notification');
            return { success: false, reason: 'No phone provided' };
        }

        const salon = await getSalonInfo();

        let formattedPhone = String(customerphone).trim();
        if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+1' + formattedPhone.replace(/\D/g, '');
        }

        const message = await twilioClient.messages.create({
            body: `Hi ${customername || 'there'}! Your booking (#${bookingkey}) has been updated. New details: ${servicename} on ${datetime}. - ${salon.name}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: formattedPhone
        });

        console.log('✅ Modification SMS sent:', message.sid);
        return { success: true, sid: message.sid };
    } catch (error) {
        console.error('❌ SMS send error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send booking cancellation SMS
 */
exports.sendBookingCancellationSMS = async (bookingData) => {
    if (!SMS_ENABLED) {
        console.log('⚠️ SMS notifications are disabled');
        return { success: false, reason: 'SMS notifications disabled' };
    }

    if (!twilioClient) {
        console.log('⚠️ Twilio client not initialized');
        return { success: false, reason: 'Twilio client not configured' };
    }

    try {
        const { customerphone, customername, datetime, servicename, bookingkey } = bookingData;

        if (!customerphone) {
            console.log('⚠️ No phone provided, skipping SMS notification');
            return { success: false, reason: 'No phone provided' };
        }

        const salon = await getSalonInfo();

        let formattedPhone = String(customerphone).trim();
        if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+1' + formattedPhone.replace(/\D/g, '');
        }

        const message = await twilioClient.messages.create({
            body: `Hi ${customername || 'there'}! Your booking (#${bookingkey}) for ${servicename} on ${datetime} has been cancelled. We hope to see you again soon! - ${salon.name}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: formattedPhone
        });

        console.log('✅ Cancellation SMS sent:', message.sid);
        return { success: true, sid: message.sid };
    } catch (error) {
        console.error('❌ SMS send error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send a password reset email containing a temporary password
 * bookingData: { customeremail, customername, password }
 */
exports.sendPasswordResetEmail = async (data) => {
    if (!EMAIL_ENABLED) {
        console.log('⚠️ Email notifications are disabled - cannot send password reset');
        return { success: false, reason: 'Email notifications disabled' };
    }

    if (!emailTransporter) {
        console.log('⚠️ Email transporter not initialized');
        return { success: false, reason: 'Email transporter not configured' };
    }

    try {
        const { customeremail, customername, password } = data;
        if (!customeremail) {
            console.log('⚠️ No email provided, skipping password reset email');
            return { success: false, reason: 'No email provided' };
        }

        const salon = await getSalonInfo();

        const mailOptions = {
            from: process.env.SMTP_FROM || `"${salon.name}" <${salon.email}>`,
            to: customeremail,
            subject: `Password Reset - ${salon.name}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Password Reset</h2>
          <p>Dear ${customername || 'Customer'},</p>
          <p>A temporary password has been generated for your account. Use it to sign in and then update your password in your profile.</p>
          <div style="background:#f5f5f5;padding:16px;border-radius:6px;margin:16px 0;text-align:center;">
            <strong style="font-size:18px;">${password}</strong>
          </div>
          <p style="color:#666;">For security, please change this password after logging in.</p>
          <p>Thank you,<br/>${salon.name}</p>
          <hr style="margin-top:20px;border:none;border-top:1px solid #eee;"/>
          <p style="font-size:12px;color:#999;">This is an automated email. If you did not request this, please contact us immediately.</p>
        </div>
      `
        };

        const info = await emailTransporter.sendMail(mailOptions);
        console.log('✅ Password reset email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (err) {
        console.error('❌ Password reset email error:', err);
        return { success: false, error: err.message };
    }
};

/**
 * Send booking cancellation email when owner cancels from approval request
 * bookingData: { customeremail, customername, datetime, servicename, staffname, bookingkey }
 */
exports.sendOwnerCancelledBookingEmail = async (bookingData) => {
    if (!EMAIL_ENABLED) {
        console.log('⚠️ Email notifications are disabled');
        return { success: false, reason: 'Email notifications disabled' };
    }

    if (!emailTransporter) {
        console.log('⚠️ Email transporter not initialized');
        return { success: false, reason: 'Email transporter not configured' };
    }

    try {
        const { customeremail, customername, datetime, servicename, staffname, bookingkey } = bookingData;

        if (!customeremail) {
            console.log('⚠️ No email provided, skipping cancellation notification');
            return { success: false, reason: 'No email provided' };
        }

        const salon = await getSalonInfo();

        const logoHtml = salon.photobase64
            ? `<img src="data:image/png;base64,${salon.photobase64}" alt="${salon.name}" style="max-width: 200px; margin-bottom: 20px;">`
            : salon.photo
                ? `<img src="${salon.photo}" alt="${salon.name}" style="max-width: 200px; margin-bottom: 20px;">`
                : '';

        const bookAgainUrl = `${FRONTEND_URL}/booking`;

        const mailOptions = {
            from: process.env.SMTP_FROM || `"${salon.name}" <${salon.email}>`,
            to: customeremail,
            subject: `Booking Cancelled - ${salon.name}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          ${logoHtml}
          <h2 style="color: #F44336; border-bottom: 2px solid #F44336; padding-bottom: 10px;">
            Booking Cancelled
          </h2>
          <p>Dear ${customername || 'Valued Customer'},</p>
          <p>Unfortunately, your booking has been cancelled by ${salon.name}. We apologize for any inconvenience.</p>
          
          <div style="background-color: #FFEBEE; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #F44336;">
            <p style="margin: 10px 0;"><strong>Booking ID:</strong> #${bookingkey}</p>
            <p style="margin: 10px 0;"><strong>Service:</strong> ${servicename || 'N/A'}</p>
            <p style="margin: 10px 0;"><strong>Staff:</strong> ${staffname || 'N/A'}</p>
            <p style="margin: 10px 0;"><strong>Date & Time:</strong> ${datetime || 'N/A'}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${bookAgainUrl}" style="display: inline-block; background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                📅 Book Again
            </a>
          </div>
          
          <p style="color: #666;">
            If you have any questions or would like to reschedule, please feel free to contact us.
          </p>
          
          <p>We hope to serve you in the future!</p>
          
          ${salon.phone ? `<p style="color: #666;">📞 Contact us: ${salon.phone}</p>` : ''}
          ${salon.email ? `<p style="color: #666;">📧 Email: ${salon.email}</p>` : ''}
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message. Please do not reply directly to this email.
          </p>
        </div>
      `
        };

        const info = await emailTransporter.sendMail(mailOptions);
        console.log('✅ Owner cancellation email sent to customer:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Owner cancellation email error:', error);
        return { success: false, error: error.message };
    }
};