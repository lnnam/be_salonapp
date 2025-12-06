const controller = require("../controllers/contact.controller");

module.exports = function (app) {
    // Public contact endpoints (no token required)

    // Send contact message
    // POST /api/contact/send-message
    // Body: { name, email, phone, message }
    app.post("/api/contact/send-message", controller._send_message);

    // Get salon contact info
    // GET /api/contact/info
    app.get("/api/contact/info", controller._get_contact_info);
};
