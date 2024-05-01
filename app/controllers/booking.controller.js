const db = require("../models");
const config = require("../config/auth.config");
const User = db.user;
//const Role = db.role;

const Op = db.Sequelize.Op;

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

exports._booking_list = async(req, res) => {
  try {
      const objstore = await db.sequelize.query("call spListCurrentBooking()");
      res.status(200).send(objstore);
  }
  catch(err) {
    res.status(500).send({ error : err.message });
  }
  
}


