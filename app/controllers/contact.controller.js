const db = require("../models");
const notifications = require('../helpers/notifications');

/**
 * Send contact message from website form
 * POST /api/contact/send-message
 * Body: { name, email, phone, message }
 */
exports._send_message = async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;

        console.log('📬 Contact message received:', { name, email, phone });

        // Validate required fields
        if (!name || !email || !message) {
            return res.status(400).json({
                error: "Missing required fields",
                required: ["name", "email", "message"]
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: "Invalid email format"
            });
        }

        // Validate message length
        if (message.trim().length < 10) {
            return res.status(400).json({
                error: "Message must be at least 10 characters long"
            });
        }

        // Normalize inputs
        const normalizedData = {
            name: String(name).trim(),
            email: String(email).trim().toLowerCase(),
            phone: phone ? String(phone).trim() : null,
            message: String(message).trim()
        };

        // Send email notification
        const emailResult = await notifications.sendContactMessageEmail(normalizedData);

        if (!emailResult.success) {
            console.error('❌ Failed to send contact message email:', emailResult.reason);
            return res.status(500).json({
                error: "Failed to send message",
                details: emailResult.reason || emailResult.error
            });
        }

        console.log('✅ Contact message sent successfully:', emailResult.messageId);

        return res.status(200).json({
            message: "Your message has been sent successfully. We will get back to you soon.",
            success: true
        });

    } catch (err) {
        console.error("❌ Contact message error:", err);
        res.status(500).json({
            error: "Internal Server Error",
            details: err.message
        });
    }
};

/**
 * Optional: Get contact form settings/info
 * GET /api/contact/info
 */
exports._get_contact_info = async (req, res) => {
    try {
        const salon = await db.sequelize.query(
            `SELECT name, email, phone, photo, photobase64 
       FROM tblsalon 
       WHERE pkey = :salonkey AND dateinactivated IS NULL 
       LIMIT 1`,
            {
                replacements: { salonkey: process.env.SALON_KEY || 1 },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        if (!salon || salon.length === 0) {
            return res.status(404).json({ error: "Salon not found" });
        }

        const salonData = salon[0];

        res.status(200).json({
            name: salonData.name || 'Salon',
            email: salonData.email || '',
            phone: salonData.phone || '',
            photo: salonData.photo || '',
            photobase64: salonData.photobase64 || ''
        });

    } catch (err) {
        console.error("❌ Get contact info error:", err);
        res.status(500).json({
            error: "Internal Server Error",
            details: err.message
        });
    }
};
