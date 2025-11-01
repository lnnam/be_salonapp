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
      const objstore = await db.sequelize.query("select pkey, fullname, phone , photo from tblcustomer where dateinactivated is null", {
        type: db.sequelize.QueryTypes.SELECT,
      });
      res.status(200).send(objstore);
      console.log(objstore);
  }
  catch(err) {
    res.status(500).send({ error : err.message });
  }
  
}
 
exports._booking_del = async (req, res) => {
  try {
    // read pkey from URL param for DELETE
    const pkey = req.params.pkey || (req.body && req.body.pkey);

    if (!pkey) {
      return res.status(400).json({ error: "Missing pkey" });
    }

    const updateQuery = `
      UPDATE tblbooking
      SET dateinactivated = NOW()
      WHERE pkey = :pkey
    `;

    await db.sequelize.query(updateQuery, {
      replacements: { pkey },
      type: db.sequelize.QueryTypes.UPDATE,
    });

    res.status(200).json({ message: "Booking deleted successfully" });
  } catch (err) {
    console.error("Database Delete Error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};

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

    // Format "10:45, 20/09/2025" to "2025-09-20 10:45:00"
function formatToMySQLDatetime(dtStr) {
  // dtStr example: "10:45, 20/09/2025"
  const [time, date] = dtStr.split(',').map(s => s.trim());
  const [hour, minute] = time.split(':');
  const [day, month, year] = date.split('/');

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00`;
}

    const formattedDatetime = formatToMySQLDatetime(datetime);

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
        customerkey, servicekey, staffkey, date, datetime: formattedDatetime,
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



