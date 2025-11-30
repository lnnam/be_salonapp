const jwt = require("jsonwebtoken");
const config = require("../config/auth.config.js");
const db = require("../models");
const User = db.user;

verifyToken = (req, res, next) => {
  // let token = req.headers["x-access-token"];
  const token = req.headers['authorization'];

  //const token = req.headers['authorization'].split(' ')[1];

  if (!token) {
    return res.status(403).send({
      message: "Unauthorized: No token provided"
    });
  }

  jwt.verify(token.split(' ')[1],
    config.secret,
    (err, decoded) => {
      if (err) {
        return res.status(401).send({
          message: 'Unauthorized: Invalid token',
        });
      }
      req.user = decoded;
      next();
    });
};

isAdmin = (req, res, next) => {
  User.findByPk(req.userId).then(user => {
    user.getRoles().then(roles => {
      for (let i = 0; i < roles.length; i++) {
        if (roles[i].name === "admin") {
          next();
          return;
        }
      }

      res.status(403).send({
        message: "Require Admin Role!"
      });
      return;
    });
  });
};

isModerator = (req, res, next) => {
  User.findByPk(req.userId).then(user => {
    user.getRoles().then(roles => {
      for (let i = 0; i < roles.length; i++) {
        if (roles[i].name === "moderator") {
          next();
          return;
        }
      }

      res.status(403).send({
        message: "Require Moderator Role!"
      });
    });
  });
};

isModeratorOrAdmin = (req, res, next) => {
  User.findByPk(req.userId).then(user => {
    user.getRoles().then(roles => {
      for (let i = 0; i < roles.length; i++) {
        if (roles[i].name === "moderator") {
          next();
          return;
        }

        if (roles[i].name === "admin") {
          next();
          return;
        }
      }

      res.status(403).send({
        message: "Require Moderator or Admin Role!"
      });
    });
  });
};

verifyCustomerToken = (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(403).send({
      message: "Unauthorized: No token provided"
    });
  }

  jwt.verify(token.split(' ')[1],
    config.secret,
    (err, decoded) => {
      if (err) {
        return res.status(401).send({
          message: 'Unauthorized: Invalid token',
        });
      }
      // Validate that this is a customer token
      if (decoded.type !== 'customer' && decoded.type !== 'member') {
        return res.status(403).send({
          message: 'Forbidden: Customer token required'
        });
      }
      req.customer = decoded;
      next();
    });
};

const authJwt = {
  verifyToken: verifyToken,
  verifyCustomerToken: verifyCustomerToken,
  isAdmin: isAdmin,
  isModerator: isModerator,
  isModeratorOrAdmin: isModeratorOrAdmin
};
module.exports = authJwt;