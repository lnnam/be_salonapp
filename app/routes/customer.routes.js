const controller = require("../controllers/customer.controller");

module.exports = function (app) {
    app.use(function (req, res, next) {
        res.header(
            "Access-Control-Allow-Headers",
            "x-access-token, Origin, Content-Type, Accept"
        );
        next();
    });

    // Add new customer
    app.post("/api/customer/addcustomer", controller.addcustomer);

    // List all customers
    app.get("/api/customer/list", controller.listcustomer);

    // Get specific customer by ID
    app.get("/api/customer/:pkey", controller.getcustomer);

    // Update customer
    app.put("/api/customer/updatecustomer/:pkey", controller.updatecustomer);

    // Activate/Deactivate customer (accepts both POST and PUT)
    app.post("/api/customer/activate/:pkey", controller.activatecustomer);
    app.put("/api/customer/activate/:pkey", controller.activatecustomer);

    // Delete customer
    app.delete("/api/customer/delete/:pkey", controller.deletecustomer);

    // Set customer as VIP
    app.post("/api/customer/setvip/:pkey", controller.setvip);
};
