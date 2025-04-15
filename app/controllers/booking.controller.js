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
     // console.log(objstore);
  }
  catch(err) {
    res.status(500).send({ error : err.message });
  }
  
}

exports._booking_customer = async(req, res) => {
  try {
      const objstore = await db.sequelize.query("select * from tblcustomer where dateinactivated is null", {
        type: db.sequelize.QueryTypes.SELECT,
      });
      res.status(200).send(objstore);
    ///  console.log(objstore);
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
      //console.log(objstore);
  }
  catch(err) {
    res.status(500).send({ error : err.message });
  }
  
}

exports._booking_listcustomer = async(req, res) => {
  try {
      const objstore = await db.sequelize.query("select * from tblcustomer where dateinactivated is null", {
        type: db.sequelize.QueryTypes.SELECT,
      });
      res.status(200).send(objstore);
      console.log(objstore);
  }
  catch(err) {
    res.status(500).send({ error : err.message });
  }
  
}
 

exports._booking_add = async (req, res) => {
  console.log(req);
  try {
    const {
      customerkey, servicekey, staffkey, date, datetime,
       note, customername, staffname, servicename,
      userkey
    } = req.body;

    // Validate required fields
    if (!customerkey || !servicekey || !staffkey || !date || !datetime ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const insertQuery = `
      INSERT INTO tblbooking 
      (customerkey, servicekey, staffkey, date, datetime, dateactivated, note, 
       customername, staffname, servicename, userkey) 
      VALUES 
      (:customerkey, :servicekey, :staffkey, CURDATE(), :datetime, NOW(), :note, 
       :customername, :staffname, :servicename, :userkey)
    `;

    const objstore = await db.sequelize.query(insertQuery, {
      replacements: {
        customerkey, servicekey, staffkey, date, datetime,
         note, customername, staffname, servicename,
        userkey
      },
      type: db.sequelize.QueryTypes.INSERT,
    });

    res.status(201).json({ message: "Booking added successfully", bookingkey: objstore[0] });

  } catch (err) {
    console.error("Database Insert Error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};

 

