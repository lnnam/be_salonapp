const nodemailer = require('nodemailer');
const twilio = require('twilio');
const db = require("../models");

// Check if notifications are enabled via environment variables
const EMAIL_ENABLED = process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true';
const SMS_ENABLED = process.env.ENABLE_SMS_NOTIFICATIONS === 'true';
const SALON_KEY = process.env.SALON_KEY || 1;

console.log('📧 Email notifications:', EMAIL_ENABLED ? 'ENABLED' : 'DISABLED');
console.log('📱 SMS notifications:', SMS_ENABLED ? 'ENABLED' : 'DISABLED');
console.log('🏢 Salon Key:', SALON_KEY);

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
        const { customeremail, customername, datetime, servicename, staffname, bookingkey } = bookingData;

        if (!customeremail) {
            console.log('⚠️ No email provided, skipping email notification');
            return { success: false, reason: 'No email provided' };
        }

        // Get salon information
        const salon = await getSalonInfo();

        // Build logo HTML if photo exists
        const logoHtml = salon.photobase64
            ? `<img src="data:image/png;base64,${salon.photobase64}" alt="${salon.name}" style="max-width: 200px; margin-bottom: 20px;">`
            : salon.photo
                ? `<img src="${salon.photo}" alt="${salon.name}" style="max-width: 200px; margin-bottom: 20px;">`
                : '';

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
          
          <p style="color: #666;">
            <strong>Important:</strong> If you need to reschedule or cancel, please contact us at least 24 hours in advance.
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

        // Get salon information
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
          
          <p style="color: #666;">
            <strong>Note:</strong> If you need to make further changes or cancel, please contact us at least 24 hours in advance.
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
 * Send booking cancellation email
 */
exports.sendBookingCancellationEmail = async (bookingData) => {
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
        console.log('✅ Cancellation email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Email send error:', error);
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