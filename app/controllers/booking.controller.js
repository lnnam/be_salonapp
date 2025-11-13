const db = require("../models");
const config = require("../config/auth.config");
const User = db.user;
//const Role = db.role;



const Op = db.Sequelize.Op;

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

exports._booking_list = async (req, res) => {
  try {
    const objstore = await db.sequelize.query("call spListCurrentBooking()");
    res.status(200).send(objstore);
  }
  catch (err) {
    res.status(500).send({ error: err.message });
  }

}

exports._booking_staff = async (req, res) => {
  try {
    const objstore = await db.sequelize.query("select pkey, fullname, photobase64 from tblstaff where dateinactivated is null order by pkey", {
      type: db.sequelize.QueryTypes.SELECT,
    });
    res.status(200).send(objstore);
    // console.log(objstore);
  }
  catch (err) {
    res.status(500).send({ error: err.message });
  }

}

exports._booking_customer = async (req, res) => {
  try {
    const objstore = await db.sequelize.query("select * from tblcustomer where dateinactivated is null", {
      type: db.sequelize.QueryTypes.SELECT,
    });
    res.status(200).send(objstore);
    ///  console.log(objstore);
  }
  catch (err) {
    res.status(500).send({ error: err.message });
  }

}

exports._booking_service = async (req, res) => {
  try {
    const objstore = await db.sequelize.query("select a.* , b.name as category from tblservice a left join tblservice_category b on a.categorykey = b.pkey where a.dateinactivated is null", {
      type: db.sequelize.QueryTypes.SELECT,
    });
    res.status(200).send(objstore);
    //console.log(objstore);
  }
  catch (err) {
    res.status(500).send({ error: err.message });
  }

}

exports._booking_listcustomer = async (req, res) => {
  try {
    const objstore = await db.sequelize.query("select pkey, fullname, phone , photo from tblcustomer where dateinactivated is null", {
      type: db.sequelize.QueryTypes.SELECT,
    });
    res.status(200).send(objstore);
    console.log(objstore);
  }
  catch (err) {
    res.status(500).send({ error: err.message });
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
      customeremail,
      customerphone,
      staffname,
      servicename,
      userkey
    } = req.body;

    // Validate required fields (customerkey may be resolved from phone/email)
    if (!servicekey || !staffkey || !datetime) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Resolve or create customer:
    // - If `customerkey` provided and >0 use it
    // - Else try to find by `customerphone`, then by `customeremail`
    // - If not found, insert a new customer and use its pkey
    let resolvedCustomerKey = customerkey && Number(customerkey) > 0 ? Number(customerkey) : null;

    if (!resolvedCustomerKey) {
      // normalize inputs
      const phone = customerphone ? String(customerphone).trim() : null;
      const email = customeremail ? String(customeremail).trim().toLowerCase() : null;

      if (phone) {
        const foundByPhone = await db.sequelize.query(
          "SELECT pkey FROM tblcustomer WHERE phone = :phone AND dateinactivated IS NULL LIMIT 1",
          { replacements: { phone }, type: db.sequelize.QueryTypes.SELECT }
        );
        if (Array.isArray(foundByPhone) && foundByPhone.length > 0) {
          resolvedCustomerKey = foundByPhone[0].pkey;
        }
      }

      if (!resolvedCustomerKey && email) {
        const foundByEmail = await db.sequelize.query(
          "SELECT pkey FROM tblcustomer WHERE LOWER(email) = :email AND dateinactivated IS NULL LIMIT 1",
          { replacements: { email }, type: db.sequelize.QueryTypes.SELECT }
        );
        if (Array.isArray(foundByEmail) && foundByEmail.length > 0) {
          resolvedCustomerKey = foundByEmail[0].pkey;
        }
      }

      if (!resolvedCustomerKey) {
        // insert new customer
        const insertCustomerQuery = `
          INSERT INTO tblcustomer (fullname, email, phone, type, dateactivated, numbooking)
          VALUES (:fullname, :email, :phone, :type, NOW(), 0)
        `;
        const ins = await db.sequelize.query(insertCustomerQuery, {
          replacements: {
            fullname: customername || null,
            email: email || null,
            phone: phone || null,
            type: 'customer'
          },
          type: db.sequelize.QueryTypes.INSERT,
        });
        // Sequelize returns array where first element is insertId
        resolvedCustomerKey = ins[0];
      }
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
            customeremail = :customeremail,
            customerphone = :customerphone,
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
          customerkey: resolvedCustomerKey,
          servicekey,
          staffkey,
          customeremail,
          customerphone,
          datetime: bookingStart,
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
         customeremail, customerphone,
         dateactivated, note, customername, staffname, servicename, userkey)
        VALUES 
        (:customerkey, :servicekey, :staffkey, CURDATE(), NOW(), :bookingstart, :bookingend, 
         :customeremail, :customerphone,
         NOW(), :note, :customername, :staffname, :servicename, :userkey)
      `;

      const objstore = await db.sequelize.query(insertQuery, {
        replacements: {
          customerkey: resolvedCustomerKey,
          servicekey,
          staffkey,
          customeremail,
          customerphone,
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
      datetime,
      note,
      customername,
      customeremail,
      customerphone,
      staffname,
      servicename,
      userkey
    } = req.body;

    if (!servicekey || !staffkey || !datetime) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let resolvedCustomerKey = customerkey && Number(customerkey) > 0 ? Number(customerkey) : null;

    if (!resolvedCustomerKey) {
      const phone = customerphone ? String(customerphone).trim() : null;
      const email = customeremail ? String(customeremail).trim().toLowerCase() : null;

      if (phone) {
        const foundByPhone = await db.sequelize.query(
          "SELECT pkey FROM tblcustomer WHERE phone = :phone AND dateinactivated IS NULL LIMIT 1",
          { replacements: { phone }, type: db.sequelize.QueryTypes.SELECT }
        );
        if (Array.isArray(foundByPhone) && foundByPhone.length > 0) {
          resolvedCustomerKey = foundByPhone[0].pkey;
        }
      }

      if (!resolvedCustomerKey && email) {
        const foundByEmail = await db.sequelize.query(
          "SELECT pkey FROM tblcustomer WHERE LOWER(email) = :email AND dateinactivated IS NULL LIMIT 1",
          { replacements: { email }, type: db.sequelize.QueryTypes.SELECT }
        );
        if (Array.isArray(foundByEmail) && foundByEmail.length > 0) {
          resolvedCustomerKey = foundByEmail[0].pkey;
        }
      }

      if (!resolvedCustomerKey) {
        const insertCustomerQuery = `
          INSERT INTO tblcustomer (fullname, email, phone, type, dateactivated, numbooking)
          VALUES (:fullname, :email, :phone, :type, NOW(), 0)
        `;
        const ins = await db.sequelize.query(insertCustomerQuery, {
          replacements: {
            fullname: customername || null,
            email: email || null,
            phone: phone || null,
            type: 'online'
          },
          type: db.sequelize.QueryTypes.INSERT,
        });
        resolvedCustomerKey = ins[0];
      }
    }

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
    const bookingEnd = new Date(bookingStart);
    bookingEnd.setMinutes(bookingEnd.getMinutes() + 45);
    const bookingEndStr = bookingEnd.toISOString().slice(0, 19).replace("T", " ");

    let newBookingKey = bookingkey;

    if (bookingkey && Number(bookingkey) > 0) {
      const updateQuery = `
        UPDATE tblbooking
        SET customerkey = :customerkey,
            servicekey = :servicekey,
            staffkey = :staffkey,
            customeremail = :customeremail,
            customerphone = :customerphone,
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
          customerkey: resolvedCustomerKey,
          servicekey,
          staffkey,
          customeremail,
          customerphone,
          datetime: bookingStart,
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

      newBookingKey = Number(bookingkey);
    } else {
      const insertQuery = `
        INSERT INTO tblbooking 
        (customerkey, servicekey, staffkey, date, datetime, bookingstart, bookingend, 
         customeremail, customerphone,
         dateactivated, note, customername, staffname, servicename, userkey)
        VALUES 
        (:customerkey, :servicekey, :staffkey, CURDATE(), NOW(), :bookingstart, :bookingend, 
         :customeremail, :customerphone,
         NOW(), :note, :customername, :staffname, :servicename, :userkey)
      `;

      const objstore = await db.sequelize.query(insertQuery, {
        replacements: {
          customerkey: resolvedCustomerKey,
          servicekey,
          staffkey,
          customeremail,
          customerphone,
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

      newBookingKey = objstore[0];
    }

    // 🎟️ Generate customer token
    const customerToken = jwt.sign(
      {
        customerkey: resolvedCustomerKey,
        email: customeremail,
        phone: customerphone,
        name: customername,
        type: 'web_customer'
      },
      config.secret,
      { expiresIn: 86400 * 30 } // 30 days
    );

    return res.status(201).json({
      message: "Booking added successfully",
      bookingkey: newBookingKey,
      customerkey: resolvedCustomerKey,
      token: customerToken
    });

  } catch (err) {
    console.error("Database Save Error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};

// Get customer profile by token
exports._customer_profile = async (req, res) => {
  try {
    const token = req.headers['authorization'];

    if (!token) {
      return res.status(403).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token.split(' ')[1], config.secret);

    const customer = await db.sequelize.query(
      "SELECT pkey, fullname, email, phone, type, dateactivated FROM tblcustomer WHERE pkey = :customerkey AND dateinactivated IS NULL",
      {
        replacements: { customerkey: decoded.customerkey },
        type: db.sequelize.QueryTypes.SELECT
      }
    );

    if (!customer || customer.length === 0) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.status(200).json(customer[0]);
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Get customer bookings by token
exports._customer_bookings = async (req, res) => {
  try {
    const token = req.headers['authorization'];

    if (!token) {
      return res.status(403).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token.split(' ')[1], config.secret);

    const bookings = await db.sequelize.query(
      `SELECT pkey, servicekey, staffkey, datetime, bookingstart, bookingend, 
              note, customername, staffname, servicename, dateactivated
       FROM tblbooking 
       WHERE customerkey = :customerkey AND dateinactivated IS NULL
       ORDER BY datetime DESC`,
      {
        replacements: { customerkey: decoded.customerkey },
        type: db.sequelize.QueryTypes.SELECT
      }
    );

    res.status(200).json(bookings);
  } catch (err) {
    console.error("Bookings fetch error:", err);
    res.status(401).json({ error: "Invalid or expired token" });
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

// Register or update a customer (member) via API
// POST /api/booking/customer/register-member
// Body: { customerkey, fullname, email, phone, password, dob }
exports._register_member = async (req, res) => {
  try {
    const { customerkey, fullname, email, phone, password, dob } = req.body;

    if (!fullname || !email || !phone || !password) {
      return res.status(400).json({ error: "Missing required fields: fullname, email, phone, password" });
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 8);

    if (customerkey && Number(customerkey) > 0) {
      // Update existing customer
      const updateQuery = `
        UPDATE tblcustomer
        SET fullname = :fullname,
            email = :email,
            phone = :phone,
            password = :password,
            birthday = :dob,
            dateactivated = COALESCE(dateactivated, NOW())
        WHERE pkey = :customerkey
      `;

      await db.sequelize.query(updateQuery, {
        replacements: {
          fullname,
          email,
          phone,
          password: hashedPassword,
          dob: dob || null,
          customerkey: Number(customerkey),
        },
        type: db.sequelize.QueryTypes.UPDATE,
      });

      return res.status(200).json({ message: "Customer updated successfully", customerkey: Number(customerkey) });
    }

    // Insert new customer
    const insertQuery = `
      INSERT INTO tblcustomer (fullname, email, phone, password, birthday, type, dateactivated, numbooking)
      VALUES (:fullname, :email, :phone, :password, :dob, :type, NOW(), 0)
    `;

    const ins = await db.sequelize.query(insertQuery, {
      replacements: {
        fullname,
        email,
        phone,
        password: hashedPassword,
        dob: dob || null,
        type: 'member',
      },
      type: db.sequelize.QueryTypes.INSERT,
    });

    // Normalize insert result to get inserted id
    let newId = null;
    if (ins && Array.isArray(ins)) {
      const first = ins[0];
      if (typeof first === 'number') newId = first;
      else if (first && typeof first.insertId !== 'undefined') newId = first.insertId;
      else if (first && typeof first.pkey !== 'undefined') newId = first.pkey;
    }

    // Fallback: select by email/phone
    if (!newId) {
      const rows = await db.sequelize.query(
        "SELECT pkey FROM tblcustomer WHERE (LOWER(email) = :email OR phone = :phone) AND dateinactivated IS NULL ORDER BY pkey DESC LIMIT 1",
        { replacements: { email: String(email).toLowerCase(), phone }, type: db.sequelize.QueryTypes.SELECT }
      );
      if (Array.isArray(rows) && rows.length > 0) newId = rows[0].pkey;
    }

    if (!newId) {
      return res.status(500).json({ error: "Failed to create customer" });
    }

    return res.status(201).json({ message: "Customer registered", customerkey: Number(newId) });
  } catch (err) {
    console.error("register-member error:", err);
    return res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};


