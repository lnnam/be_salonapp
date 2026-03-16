const controller = require("../controllers/pos.controller");

module.exports = function (app) {
    app.use(function (req, res, next) {
        res.header(
            "Access-Control-Allow-Headers",
            "x-access-token, Origin, Content-Type, Accept"
        );
        next();
    });

    // Services
    app.get("/api/pos/service", controller.listservice);

    // Sales
    app.post("/api/pos/sale", controller.createsale);
    app.get("/api/pos/sale", controller.listsales);
    app.get("/api/pos/receipt", controller.listsales);
    app.get("/api/pos/sale/:pkey", controller.getsale);
    app.put("/api/pos/sale/:pkey/complete", controller.completesale);
    app.put("/api/pos/sale/:pkey/void", controller.voidsale);

    // Sale items
    app.post("/api/pos/sale/:salepkey/item", controller.addsaleitem);
    app.delete("/api/pos/sale/:salepkey/item/:itempkey", controller.removesaleitem);

    // Reports
    app.get("/api/pos/summary/daily", controller.summaryreport);
    app.get("/api/pos/report/daily", controller.dailyreport);
};
