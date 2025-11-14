const { authJwt } = require("../middleware");
const controller = require("../controllers/booking.controller");
const verifyToken = authJwt.verifyToken;

// Whitelist of allowed origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://yourdomain.com',
  'https://www.yourdomain.com'
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
  app.get("/api/booking/staff", controller._booking_staff);
  app.get("/api/booking/service", controller._booking_service);
  app.get("/api/booking/getavailability", controller._getavailability);

  // Protected customer endpoints (token required)
  app.get("/api/booking/customer/profile", controller._customer_profile);
  app.get("/api/booking/customer/bookings", controller._customer_bookings);
  app.post("/api/booking/customer/cancel", controller._customer_cancel_booking);
  app.post("/api/booking/cancel", controller._customer_cancel_booking); // Alias

  // Admin endpoints (verifyToken required)
  app.get("/api/booking/list", verifyToken, controller._booking_list);
  app.get("/api/booking/customer", verifyToken, controller._booking_customer);
  app.post("/api/booking/save", verifyToken, controller._booking_save);
  app.post("/api/booking/customer/register-member", verifyToken, controller._register_member);
  app.delete("/api/booking/del/:pkey", verifyToken, controller._booking_del);

};


