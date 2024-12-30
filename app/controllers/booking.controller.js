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

exports._booking_staff = async(req, res) => {
  try {
      const objstore = await db.sequelize.query("select * from tblstaff where dateinactivated is null", {
        type: db.sequelize.QueryTypes.SELECT,
      });
      res.status(200).send(objstore);
      console.log(objstore);
  }
  catch(err) {
    res.status(500).send({ error : err.message });
  }
  
}

exports._booking_service = async(req, res) => {
  try {
      const objstore = await db.sequelize.query("select a.* , b.name as category from tblservice a left join tblservice_category b on a.categorykey = b.pkey where a.dateinactivated is null", {
        type: db.sequelize.QueryTypes.SELECT,
      });
      res.status(200).send(objstore);
      console.log(objstore);
  }
  catch(err) {
    res.status(500).send({ error : err.message });
  }
  
}
 

