const { verifySignUp } = require("../middleware");
const controller = require("../controllers/booking.controller");

module.exports = function(app) {

  app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,PUT,PATCH,POST,DELETE");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });
 
  app.get("/api/booking/list", verifyToken, controller._booking_list);
  app.get("/api/booking/staff", verifyToken, controller._booking_staff);
  app.get("/api/booking/service", verifyToken, controller._booking_service);

  app.get("/api/booking/customer", verifyToken, controller._booking_customer);
  app.get("/api/booking/add", verifyToken, controller._booking_add);
};


