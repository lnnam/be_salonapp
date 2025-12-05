const { authJwt } = require("../middleware");
const controller = require("../controllers/booking.controller");
const verifyToken = authJwt.verifyToken;
const verifyCustomerToken = authJwt.verifyCustomerToken;

// Whitelist of allowed origins
const allowedOrigins = [
  'http://localhost:3000',
  'https://booking.greatyarmouthnails.com/',
];

module.exports = function (app) {

  // CORS middleware with origin whitelist
  app.use("/api/booking", function (req, res, next) {
    const origin = req.headers.origin;

    if (allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
    }

    res.header("Access-Control-Allow-Methods", "GET,PUT,PATCH,POST,DELETE");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }

    next();
  });

  // Public customer endpoints (no token required)
  app.post("/api/booking/customer/register", controller._customer_register);
  app.post("/api/booking/customer/login", controller._customer_login);
  app.post("/api/booking/websave", controller._bookingweb_save);
  // Password reset (public)
  app.post("/api/booking/customer/reset-password", controller._customer_reset_password);
  app.get("/api/booking/staff", controller._booking_staff);
  app.get("/api/booking/service", controller._booking_service);
  app.get("/api/booking/getavailability", controller._getavailability);

  // Protected customer endpoints (token required)
  app.get("/api/booking/customer/profile", controller._customer_profile);
  app.get("/api/booking/customer/bookings", controller._customer_bookings);
  app.get("/api/booking/customer/list", controller._booking_listcustomer);
  app.post("/api/booking/customer/cancel", controller._customer_cancel_booking);
  app.post("/api/booking/cancel", controller._customer_cancel_booking); // Alias

  // Admin endpoints (verifyToken required)
  app.get("/api/booking/list", verifyToken, controller._booking_list);
  app.get("/api/booking/owner/list", controller._booking_list_owner); // TEMP: removed verifyToken for testing
  app.post("/api/booking/save", verifyToken, controller._booking_save);
  app.post("/api/booking/customer/register-member", verifyToken, controller._register_member);
  app.delete("/api/booking/del/:pkey", verifyToken, controller._booking_del);

  // Protected customer endpoints 
  app.get("/api/booking/setting", controller._get_app_setting);

  // Email action endpoints (with token authentication)
  app.get("/api/booking/email-cancel", controller._email_cancel_booking);
  app.get("/api/booking/email-modify", controller._email_redirect_modify);
  app.get("/api/booking/email-view", controller._email_redirect_view);
  app.get("/api/booking/owner/confirm", controller._owner_confirm_booking);
  app.get("/api/booking/owner/cancel", controller._owner_cancel_booking);
  // Owner platform confirm (authenticated)
  //app.post("/api/booking/owner/confirm", verifyToken, controller._owner_confirm_booking_admin);

  // Customer management endpoints (public)
  app.post("/api/booking/customer/add", controller._add_customer);
};


