const { authJwt } = require("../middleware");
const controller = require("../controllers/customer.controller");
const verifyToken = authJwt.verifyToken;

module.exports = function (app) {
    app.use(function (req, res, next) {
        res.header(
            "Access-Control-Allow-Headers",
            "x-access-token, Origin, Content-Type, Accept"
        );
        next();
    });

    // Add new customer
    app.post("/api/customer/addcustomer", verifyToken, controller.addcustomer);

    // List all customers
    app.get("/api/customer/list", verifyToken, controller.listcustomer);

    // List customers with upcoming birthdays (next 3 weeks)
    app.get("/api/customer/upcoming-birthday", verifyToken, controller.listcustomerupcomingbirthday);

    // Get specific customer by ID
    app.get("/api/customer/:pkey", verifyToken, controller.getcustomer);

    // Update customer
    app.put("/api/customer/updatecustomer/:pkey", verifyToken, controller.updatecustomer);

    // Activate/Deactivate customer (accepts both POST and PUT)
    app.post("/api/customer/activate/:pkey", verifyToken, controller.activatecustomer);
    app.put("/api/customer/activate/:pkey", verifyToken, controller.activatecustomer);

    // Delete customer
    app.delete("/api/customer/delete/:pkey", verifyToken, controller.deletecustomer);

    // Set customer as VIP
    app.post("/api/customer/setvip/:pkey", verifyToken, controller.setvip);

    // List bookings for a customer
    app.get("/api/customer/:pkey/listbooking", verifyToken, controller.listbooking);
};
