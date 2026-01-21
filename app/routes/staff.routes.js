const controller = require("../controllers/staff.controller");

module.exports = function (app) {
    app.use(function (req, res, next) {
        res.header(
            "Access-Control-Allow-Headers",
            "x-access-token, Origin, Content-Type, Accept"
        );
        next();
    });

    // Add new staff
    app.post("/api/staff/addstaff", controller.addstaff);

    // List all staff
    app.get("/api/staff/list", controller.liststaff);

    // Get specific staff by ID
    app.get("/api/staff/:pkey", controller.getstaff);

    // Update staff
    app.put("/api/staff/updatestaff/:pkey", controller.updatestaff);

    // Activate/Deactivate staff (accepts both POST and PUT)
    app.post("/api/staff/activate/:pkey", controller.activatestaff);
    app.put("/api/staff/activate/:pkey", controller.activatestaff);
};
