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
      const objstore = await db.sequelize.query("select pkey, fullname, photobase64 from tblstaff where dateinactivated is null order by pkey", {
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

exports._booking_save = async (req, res) => {
  console.log("Received booking save request:", req.body);

  try {
    const {
      bookingkey,
      customerkey,
      servicekey,
      staffkey,
      date,
      datetime, // e.g. "10:45, 20/09/2025"
      note,
      customername,
      staffname,
      servicename,
      userkey
    } = req.body;

    // Validate required fields
    if (!customerkey || !servicekey || !staffkey || !datetime) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // ⏰ Convert "10:45, 20/09/2025" → MySQL DATETIME "2025-09-20 10:45:00"
    function formatToMySQLDatetime(dtStr) {
      const [time, datePart] = dtStr.split(",").map((s) => s.trim());
      const [hour, minute] = time.split(":");
      const [day, month, year] = datePart.split("/");
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")} ${hour.padStart(
        2,
        "0"
      )}:${minute.padStart(2, "0")}:00`;
    }

    const bookingStart = formatToMySQLDatetime(datetime);

    // 💡 Calculate booking end = start + 45 minutes
    const bookingEnd = new Date(bookingStart);
    bookingEnd.setMinutes(bookingEnd.getMinutes() + 45);

    // Convert back to MySQL string format
    const bookingEndStr = bookingEnd.toISOString().slice(0, 19).replace("T", " ");

    if (bookingkey && Number(bookingkey) > 0) {
      // 🔄 UPDATE existing booking
      const updateQuery = `
        UPDATE tblbooking
        SET customerkey = :customerkey,
            servicekey = :servicekey,
            staffkey = :staffkey,
            date = DATE(:datetime),
             datetime = :datetime,
            bookingstart = :bookingstart,
            bookingend = :bookingend,
            note = :note,
            customername = :customername,
            staffname = :staffname,
            servicename = :servicename,
            userkey = :userkey,
            dateactivated = COALESCE(dateactivated, NOW())
        WHERE pkey = :bookingkey
      `;

      await db.sequelize.query(updateQuery, {
        replacements: {
          bookingkey: Number(bookingkey),
          customerkey,
          servicekey,
          staffkey,
          datetime: formattedDatetime,
          bookingstart: bookingStart,
          bookingend: bookingEndStr,
          note,
          customername,
          staffname,
          servicename,
          userkey,
        },
        type: db.sequelize.QueryTypes.UPDATE,
      });

      return res
        .status(201)
        .json({ message: "Booking updated successfully", bookingkey: Number(bookingkey) });
    } else {
      // 🆕 INSERT new booking
      const insertQuery = `
        INSERT INTO tblbooking 
        (customerkey, servicekey, staffkey,date, datetime, bookingstart, bookingend, 
         dateactivated, note, customername, staffname, servicename, userkey)
        VALUES 
        (:customerkey, :servicekey, :staffkey, CURDATE(), NOW(), :bookingstart, :bookingend, 
         NOW(), :note, :customername, :staffname, :servicename, :userkey)
      `;

      const objstore = await db.sequelize.query(insertQuery, {
        replacements: {
          customerkey,
          servicekey,
          staffkey,
          bookingstart: bookingStart,
          bookingend: bookingEndStr,
          note,
          customername,
          staffname,
          servicename,
          userkey,
        },
        type: db.sequelize.QueryTypes.INSERT,
      });

      return res.status(201).json({
        message: "Booking added successfully",
        bookingkey: objstore[0],
      });
    }
  } catch (err) {
    console.error("Database Save Error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};

exports._bookingweb_save = async (req, res) => {
  console.log("Received booking save request:", req.body);

  try {
    const {
      bookingkey,
      customerkey,
      servicekey,
      staffkey,
      date,
      datetime, // e.g. "10:45, 20/09/2025"
      note,
      customername,
      staffname,
      servicename,
      userkey
    } = req.body;

    // Validate required fields
    if (!customerkey || !servicekey || !staffkey || !datetime) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // ⏰ Convert "10:45, 20/09/2025" → MySQL DATETIME "2025-09-20 10:45:00"
    function formatToMySQLDatetime(dtStr) {
      const [time, datePart] = dtStr.split(",").map((s) => s.trim());
      const [hour, minute] = time.split(":");
      const [day, month, year] = datePart.split("/");
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")} ${hour.padStart(
        2,
        "0"
      )}:${minute.padStart(2, "0")}:00`;
    }

    const bookingStart = formatToMySQLDatetime(datetime);

    // 💡 Calculate booking end = start + 45 minutes
    const bookingEnd = new Date(bookingStart);
    bookingEnd.setMinutes(bookingEnd.getMinutes() + 45);

    // Convert back to MySQL string format
    const bookingEndStr = bookingEnd.toISOString().slice(0, 19).replace("T", " ");

    if (bookingkey && Number(bookingkey) > 0) {
      // 🔄 UPDATE existing booking
      const updateQuery = `
        UPDATE tblbooking
        SET customerkey = :customerkey,
            servicekey = :servicekey,
            staffkey = :staffkey,
            date = DATE(:datetime),
             datetime = :datetime,
            bookingstart = :bookingstart,
            bookingend = :bookingend,
            note = :note,
            customername = :customername,
            staffname = :staffname,
            servicename = :servicename,
            userkey = :userkey,
            dateactivated = COALESCE(dateactivated, NOW())
        WHERE pkey = :bookingkey
      `;

      await db.sequelize.query(updateQuery, {
        replacements: {
          bookingkey: Number(bookingkey),
          customerkey,
          servicekey,
          staffkey,
          datetime: formattedDatetime,
          bookingstart: bookingStart,
          bookingend: bookingEndStr,
          note,
          customername,
          staffname,
          servicename,
          userkey,
        },
        type: db.sequelize.QueryTypes.UPDATE,
      });

      return res
        .status(201)
        .json({ message: "Booking updated successfully", bookingkey: Number(bookingkey) });
    } else {
      // 🆕 INSERT new booking
      const insertQuery = `
        INSERT INTO tblbooking 
        (customerkey, servicekey, staffkey,date, datetime, bookingstart, bookingend, 
         dateactivated, note, customername, staffname, servicename, userkey)
        VALUES 
        (:customerkey, :servicekey, :staffkey, CURDATE(), NOW(), :bookingstart, :bookingend, 
         NOW(), :note, :customername, :staffname, :servicename, :userkey)
      `;

      const objstore = await db.sequelize.query(insertQuery, {
        replacements: {
          customerkey,
          servicekey,
          staffkey,
          bookingstart: bookingStart,
          bookingend: bookingEndStr,
          note,
          customername,
          staffname,
          servicename,
          userkey,
        },
        type: db.sequelize.QueryTypes.INSERT,
      });

      return res.status(201).json({
        message: "Booking added successfully",
        bookingkey: objstore[0],
      });
    }
  } catch (err) {
    console.error("Database Save Error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};

exports._getavailability = async (req, res) => {
  try {
    const { date, staffkey } = req.query;

    // ✅ Default values
    const p_date = date || new Date().toISOString().split("T")[0];
    let p_staffkey = null;

    if (staffkey && staffkey !== "0" && staffkey.toLowerCase() !== "null") {
      const parsed = parseInt(staffkey, 10);
      p_staffkey = Number.isNaN(parsed) ? null : parsed;
    }

    // ✅ Execute stored procedure
    const result = await db.sequelize.query(
      "CALL getAvailability(:date, :staffkey, :slotDuration, :serviceDuration)",
      {
        replacements: {
          date: p_date,
          staffkey: p_staffkey,
          slotDuration: 15,
          serviceDuration: 45,
        },
      }
    );

    // ⚙️ Handle possible shapes
    let rows;
    if (Array.isArray(result)) {
      if (Array.isArray(result[0])) rows = result[0]; // [[...]]
      else rows = result; // [...]
    } else if (typeof result === "object") {
      // sometimes Sequelize returns {0: [...], meta: {...}}
      rows = Array.isArray(result[0]) ? result[0] : Object.values(result).find(Array.isArray);
    }

    if (!Array.isArray(rows)) {
      console.error("Unexpected SQL result:", result);
      return res.status(500).json({ error: "Unexpected SQL return format" });
    }

    if (rows.length === 0) {
      return res.status(404).json({ message: "No availability found" });
    }

    // ✅ Format rows
    const formatted = rows.map(r => ({
      date: r.date,
      staffkey: r.staffkey,
      slot_time: r.slot_time,
      available: !!r.available,
    }));

    res.json({
      date: p_date,
      staffkey: p_staffkey,
      slots: formatted,
    });
  } catch (error) {
    console.error("❌ getAvailability error:", error);
    res.status(500).json({ error: error.message });
  }
};


