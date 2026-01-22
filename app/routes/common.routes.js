const { authJwt, verifySignUp } = require("../middleware");
const controller = require("../controllers/common.controller");
const verifyToken = authJwt.verifyToken;

// Whitelist of allowed origins
const allowedOrigins = [
  'http://localhost:3000',
  'https://booking.greatyarmouthnails.com/',
];


module.exports = function (app) {

  app.get("/api/getdata", verifyToken, controller.callstore);

};
