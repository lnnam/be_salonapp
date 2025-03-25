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

exports._booking_customer = async(req, res) => {
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
  try {
    const {
      customerkey, servicekey, staffkey, date, datetime,
      dateactivated, note, customername, staffname, servicename,
      userkey, log
    } = req.body;

    // Validate required fields
    if (!customerkey || !servicekey || !staffkey || !date || !datetime || !dateactivated) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const insertQuery = `
      INSERT INTO tblbooking 
      (customerkey, servicekey, staffkey, date, datetime, dateactivated, note, 
       customername, staffname, servicename, userkey, log, numperson) 
      VALUES 
      (:customerkey, :servicekey, :price, :staffkey, :CURDATE(), :datetime, :NOW(), :note, 
       :customername, :staffname, :servicename, :userkey, :bill_time, :log)
    `;

    const objstore = await db.sequelize.query(insertQuery, {
      replacements: {
        customerkey, servicekey, staffkey, date, datetime,
        dateactivated, note, customername, staffname, servicename,
        userkey, log
      },
      type: db.sequelize.QueryTypes.INSERT,
    });

    res.status(201).json({ message: "Booking added successfully", bookingId: objstore[0] });

  } catch (err) {
    console.error("Database Insert Error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};

 

