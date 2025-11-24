const db = require("../models");
const config = require("../config/auth.config");
const User = db.user;
//const Role = db.role;



const Op = db.Sequelize.Op;

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");
const notifications = require('../helpers/notifications');

// Add helper function to format datetime for display
function formatDatetimeForDisplay(mysqlDatetime) {
  try {
    const dt = new Date(mysqlDatetime);
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return dt.toLocaleDateString('en-US', options);
  } catch (e) {
    return mysqlDatetime;
  }
}

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

exports._booking_save = async (req, res) => {
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
    const isUpdating = bookingkey && Number(bookingkey) > 0;

    // ✅ Only resolve/create customer for NEW bookings
    if (!isUpdating && !resolvedCustomerKey) {
      // Accept either snake_case (`customerphone`) or camelCase (`customerPhone`) from clients
      const phoneRaw = (typeof customerphone !== 'undefined' ? customerphone : req.body.customerPhone);
      const emailRaw = (typeof customeremail !== 'undefined' ? customeremail : req.body.customerEmail);
      const phone = phoneRaw ? String(phoneRaw).trim() : null;
      const email = emailRaw ? String(emailRaw).trim().toLowerCase() : null;

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
          // Email exists — reuse customer record and update phone if provided instead of inserting duplicate
          try {
            if (phone) {
              await db.sequelize.query(
                "UPDATE tblcustomer SET phone = :phone WHERE pkey = :pkey",
                { replacements: { phone, pkey: resolvedCustomerKey }, type: db.sequelize.QueryTypes.UPDATE }
              );
              console.log('✅ Updated existing customer phone for pkey:', resolvedCustomerKey);
            }
          } catch (e) {
            console.warn('⚠️ Could not update phone for existing customer pkey=', resolvedCustomerKey, e && e.message);
          }
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
            type: 'customer'
          },
          type: db.sequelize.QueryTypes.INSERT,
        });
        resolvedCustomerKey = ins[0];
      }
    } else if (isUpdating && !resolvedCustomerKey) {
      // ✅ For updates, get the existing customerkey from the booking
      console.log('⚠️ No customerkey provided for update, fetching from existing booking');
      const existingBooking = await db.sequelize.query(
        "SELECT customerkey FROM tblbooking WHERE pkey = :bookingkey LIMIT 1",
        {
          replacements: { bookingkey: Number(bookingkey) },
          type: db.sequelize.QueryTypes.SELECT
        }
      );
      if (existingBooking && existingBooking.length > 0) {
        resolvedCustomerKey = existingBooking[0].customerkey;
        console.log('✅ Using existing customerkey:', resolvedCustomerKey);
      } else {
        return res.status(404).json({ error: "Booking not found" });
      }
    }

    // ✅ Validate that we have a customer
    if (!resolvedCustomerKey) {
      return res.status(400).json({ error: "Unable to determine customer" });
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
    let isNewBooking = false;

    if (isUpdating) {
      // UPDATE existing booking
      console.log('📝 Updating booking:', bookingkey, 'with customerkey:', resolvedCustomerKey);

      // ✅ Fetch customer email and phone from tblcustomer
      const customerInfo = await db.sequelize.query(
        "SELECT email, phone, fullname FROM tblcustomer WHERE pkey = :customerkey LIMIT 1",
        {
          replacements: { customerkey: resolvedCustomerKey },
          type: db.sequelize.QueryTypes.SELECT
        }
      );

      let finalEmail = customeremail;
      let finalPhone = customerphone;
      let finalName = customername;

      if (customerInfo && customerInfo.length > 0) {
        finalEmail = customerInfo[0].email;
        finalPhone = customerInfo[0].phone;
        finalName = finalName || customerInfo[0].fullname;
        console.log('✅ Customer info from database:', {
          email: finalEmail,
          phone: finalPhone,
          name: finalName
        });
      }

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
          customeremail: finalEmail,
          customerphone: finalPhone,
          datetime: bookingStart,
          bookingstart: bookingStart,
          bookingend: bookingEndStr,
          note,
          customername: finalName,
          staffname,
          servicename,
          userkey,
        },
        type: db.sequelize.QueryTypes.UPDATE,
      });

      newBookingKey = Number(bookingkey);

      console.log('✅ Booking updated, preparing notifications...');

      // ✅ Generate customer token for modified booking
      const customerToken = jwt.sign(
        {
          customerkey: resolvedCustomerKey,
          email: finalEmail,
          phone: finalPhone,
          name: finalName,
          type: 'customer'
        },
        config.secret,
        { expiresIn: 86400 * 30 }
      );

      // ✅ Send modification notifications using customer info from database
      if (finalEmail || finalPhone) {
        console.log('📬 Sending modification notifications to:', {
          email: finalEmail,
          phone: finalPhone
        });

        const notificationData = {
          bookingkey: newBookingKey,
          customername: finalName || 'Guest',
          customeremail: finalEmail,
          customerphone: finalPhone,
          datetime: formatDatetimeForDisplay(bookingStart),
          servicename: servicename || 'Service',
          staffname: staffname || 'Staff',
          token: customerToken
        };

        console.log('📦 Notification data:', notificationData);

        Promise.all([
          notifications.sendBookingModificationEmail(notificationData),
          notifications.sendBookingModificationSMS(notificationData)
        ]).then(results => {
          console.log('📬 Modification notification results:', results);
        }).catch(err => {
          console.error('⚠️ Modification notification error (non-critical):', err);
        });
      } else {
        console.log('⚠️ No email or phone found in customer record');
      }

    } else {
      // INSERT new booking
      console.log('✨ Creating new booking with customerkey:', resolvedCustomerKey);

      const insertQuery = `
        INSERT INTO tblbooking 
        (customerkey, servicekey, staffkey, date, datetime, bookingstart, bookingend, 
         customeremail, customerphone,
         dateactivated, note, customername, staffname, servicename, userkey, createdby)
        VALUES 
        (:customerkey, :servicekey, :staffkey, CURDATE(), NOW(), :bookingstart, :bookingend, 
         :customeremail, :customerphone,
         NOW(), :note, :customername, :staffname, :servicename, :userkey, 'salon')
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
      isNewBooking = true;

      // ✅ Increment numbooking for customer
      await db.sequelize.query(
        "UPDATE tblcustomer SET numbooking = numbooking + 1 WHERE pkey = :customerkey",
        {
          replacements: { customerkey: resolvedCustomerKey },
          type: db.sequelize.QueryTypes.UPDATE
        }
      );

      console.log('✅ Incremented numbooking for customer:', resolvedCustomerKey);

      // ✅ Fetch customer info from tblcustomer for email notifications
      const customerInfo = await db.sequelize.query(
        "SELECT email, phone, fullname FROM tblcustomer WHERE pkey = :customerkey LIMIT 1",
        {
          replacements: { customerkey: resolvedCustomerKey },
          type: db.sequelize.QueryTypes.SELECT
        }
      );

      let finalEmail = customeremail;
      let finalPhone = customerphone;
      let finalName = customername;

      if (customerInfo && customerInfo.length > 0) {
        finalEmail = finalEmail || customerInfo[0].email;
        finalPhone = finalPhone || customerInfo[0].phone;
        finalName = finalName || customerInfo[0].fullname;
        console.log('✅ Customer info from database for new booking:', {
          email: finalEmail,
          phone: finalPhone,
          name: finalName
        });
      }

      // ✅ Generate customer token for new booking
      const customerToken = jwt.sign(
        {
          customerkey: resolvedCustomerKey,
          email: finalEmail,
          phone: finalPhone,
          name: finalName,
          type: 'customer'
        },
        config.secret,
        { expiresIn: 86400 * 30 }
      );

      // ✅ Send confirmation notifications (only for new bookings)
      if (finalEmail || finalPhone) {
        console.log('📬 Sending confirmation notifications to:', {
          email: finalEmail,
          phone: finalPhone
        });

        const notificationData = {
          bookingkey: newBookingKey,
          customername: finalName || 'Guest',
          customeremail: finalEmail,
          customerphone: finalPhone,
          datetime: formatDatetimeForDisplay(bookingStart),
          servicename: servicename || 'Service',
          staffname: staffname || 'Staff',
          token: customerToken
        };

        console.log('📦 Notification data:', notificationData);

        Promise.all([
          notifications.sendBookingEmail(notificationData),
          notifications.sendBookingSMS(notificationData)
        ]).then(results => {
          console.log('📬 Confirmation notification results:', results);
        }).catch(err => {
          console.error('⚠️ Confirmation notification error (non-critical):', err);
        });
      } else {
        console.log('⚠️ No email or phone found in customer record for new booking');
      }
    }

    // Generate customer token (for response)
    const customerToken = jwt.sign(
      {
        customerkey: resolvedCustomerKey,
        email: customeremail,
        phone: customerphone,
        name: customername,
        type: 'customer'
      },
      config.secret,
      { expiresIn: 86400 * 30 }
    );

    return res.status(isNewBooking ? 201 : 200).json({
      message: isNewBooking ? "Booking added successfully" : "Booking updated successfully",
      bookingkey: newBookingKey,
      customerkey: resolvedCustomerKey,
      token: customerToken
    });

  } catch (err) {
    console.error("Database Save Error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};

exports._booking_del = async (req, res) => {
  try {
    const pkey = req.params.pkey || (req.body && req.body.pkey);

    if (!pkey) {
      return res.status(400).json({ error: "Missing pkey" });
    }

    // 📧 Get booking details BEFORE deletion for email notification
    const bookingDetails = await db.sequelize.query(
      `SELECT customername, customeremail, customerphone, datetime, bookingstart, 
              servicename, staffname 
       FROM tblbooking 
       WHERE pkey = :pkey AND dateinactivated IS NULL`,
      {
        replacements: { pkey },
        type: db.sequelize.QueryTypes.SELECT
      }
    );

    const updateQuery = `
      UPDATE tblbooking
      SET status = 'cancelled',
          dateinactivated = NOW()
      WHERE pkey = :pkey
    `;

    // Execute update and inspect result to ensure rows were affected
    const updateResult = await db.sequelize.query(updateQuery, {
      replacements: { pkey },
      type: db.sequelize.QueryTypes.UPDATE,
    });

    // Sequelize/mysql2 may return different shapes: log for debugging
    console.log('Booking cancel update result:', updateResult);

    // Determine affected rows in a robust way
    let affectedRows = 0;
    try {
      // updateResult can be [result] or result depending on config
      const first = Array.isArray(updateResult) ? updateResult[0] : updateResult;
      if (first && typeof first.affectedRows !== 'undefined') affectedRows = first.affectedRows;
      else if (typeof updateResult === 'number') affectedRows = updateResult;
      else if (Array.isArray(updateResult) && typeof updateResult[1] === 'number') affectedRows = updateResult[1];
    } catch (e) {
      console.warn('Could not determine affectedRows from update result', e);
    }

    if (!affectedRows) {
      console.warn(`No booking row was updated for pkey=${pkey}.`);
      // still respond success for idempotency, but notify caller
      return res.status(404).json({ error: 'Booking not found or already cancelled' });
    }

    // 📧 Send cancellation notifications if booking existed
    if (bookingDetails && bookingDetails.length > 0) {
      const booking = bookingDetails[0];
      if (booking.customeremail || booking.customerphone) {
        const notificationData = {
          bookingkey: pkey,
          customername: booking.customername || 'Guest',
          customeremail: booking.customeremail,
          customerphone: booking.customerphone,
          datetime: formatDatetimeForDisplay(booking.bookingstart || booking.datetime),
          servicename: booking.servicename || 'Service',
          staffname: booking.staffname || 'Staff'
        };

        Promise.all([
          notifications.sendBookingCancellationEmail(notificationData),
          notifications.sendBookingCancellationSMS(notificationData)
        ]).then(results => {
          console.log('📬 Cancellation notification results:', results);
        }).catch(err => {
          console.error('⚠️ Cancellation notification error (non-critical):', err);
        });
      }
    }

    res.status(200).json({ message: "Booking deleted successfully" });
  } catch (err) {
    console.error("Database Delete Error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};

exports._customer_cancel_booking = async (req, res) => {
  try {
    const token = req.headers['authorization'];
    const { bookingkey } = req.body;

    console.log('🚫 Cancel booking request:', { bookingkey });

    if (!token) {
      return res.status(403).json({ message: "No token provided" });
    }

    if (!bookingkey) {
      return res.status(400).json({ error: "Missing bookingkey" });
    }

    const tokenPart = token.includes(' ') ? token.split(' ')[1] : token;

    let decoded;
    try {
      decoded = jwt.verify(tokenPart, config.secret);
      console.log('✅ Token decoded for cancel:', decoded);
    } catch (verifyErr) {
      console.error('❌ Token verification failed:', verifyErr.message);
      return res.status(401).json({ error: "Invalid or expired token", details: verifyErr.message });
    }

    if (!decoded.customerkey) {
      return res.status(401).json({ error: "Invalid token: missing customerkey" });
    }

    // Get booking details for notification
    const bookingCheck = await db.sequelize.query(
      `SELECT pkey, customerkey, datetime, bookingstart, customername, customeremail, 
              customerphone, servicename, staffname
       FROM tblbooking 
       WHERE pkey = :bookingkey 
         AND customerkey = :customerkey 
         AND dateinactivated IS NULL`,
      {
        replacements: {
          bookingkey: Number(bookingkey),
          customerkey: decoded.customerkey
        },
        type: db.sequelize.QueryTypes.SELECT
      }
    );

    if (!bookingCheck || bookingCheck.length === 0) {
      return res.status(404).json({ error: "Booking not found or does not belong to you" });
    }

    const booking = bookingCheck[0];

    const bookingTime = new Date(booking.bookingstart || booking.datetime);
    if (bookingTime < new Date()) {
      return res.status(400).json({ error: "Cannot cancel past bookings" });
    }

    const cancelQuery = `
      UPDATE tblbooking
      SET status = 'cancelled',
          dateinactivated = NOW()
      WHERE pkey = :bookingkey
    `;

    await db.sequelize.query(cancelQuery, {
      replacements: { bookingkey: Number(bookingkey) },
      type: db.sequelize.QueryTypes.UPDATE,
    });

    console.log('✅ Booking cancelled:', bookingkey);

    // 📧 Send cancellation notifications
    if (booking.customeremail || booking.customerphone) {
      const notificationData = {
        bookingkey: Number(bookingkey),
        customername: booking.customername || 'Guest',
        customeremail: booking.customeremail,
        customerphone: booking.customerphone,
        datetime: formatDatetimeForDisplay(booking.bookingstart || booking.datetime),
        servicename: booking.servicename || 'Service',
        staffname: booking.staffname || 'Staff'
      };

      Promise.all([
        notifications.sendBookingCancellationEmail(notificationData),
        notifications.sendBookingCancellationSMS(notificationData)
      ]).then(results => {
        console.log('📬 Cancellation notification results:', results);
      }).catch(err => {
        console.error('⚠️ Cancellation notification error (non-critical):', err);
      });
    }

    res.status(200).json({
      message: "Booking cancelled successfully",
      bookingkey: Number(bookingkey)
    });

  } catch (err) {
    console.error("❌ Cancel booking error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};

// Customer login
// POST /api/booking/customer/login
// Body: { identifier, password } - identifier can be email or phone
exports._customer_login = async (req, res) => {
  try {
    // Add detailed logging
    console.log('📥 Login request received:');
    console.log('  - Body:', req.body);
    console.log('  - Headers:', req.headers);

    // Accept both 'identifier' and 'emailOrPhone' field names
    const identifier = req.body.identifier || req.body.emailOrPhone;
    const password = req.body.password;

    console.log('🔐 Customer login attempt:', {
      identifier,
      hasPassword: !!password,
      identifierType: typeof identifier,
      passwordType: typeof password
    });

    if (!identifier || !password) {
      console.log('❌ Validation failed - missing fields:', {
        hasIdentifier: !!identifier,
        hasPassword: !!password,
        bodyKeys: Object.keys(req.body)
      });
      return res.status(400).json({
        error: "Missing identifier or password",
        received: {
          identifier: identifier ? 'present' : 'missing',
          password: password ? 'present' : 'missing',
          bodyKeys: Object.keys(req.body)
        }
      });
    }

    // Normalize identifier
    const normalizedIdentifier = String(identifier).trim().toLowerCase();

    // Check if identifier is email or phone
    const isEmail = normalizedIdentifier.includes('@');

    // Query customer by email or phone
    const query = isEmail
      ? "SELECT pkey, fullname, email, phone, password, type, dateactivated FROM tblcustomer WHERE LOWER(email) = :identifier AND dateinactivated IS NULL LIMIT 1"
      : "SELECT pkey, fullname, email, phone, password, type, dateactivated FROM tblcustomer WHERE phone = :identifier AND dateinactivated IS NULL LIMIT 1";

    const customers = await db.sequelize.query(query, {
      replacements: { identifier: normalizedIdentifier },
      type: db.sequelize.QueryTypes.SELECT
    });

    if (!customers || customers.length === 0) {
      console.log('❌ Customer not found:', normalizedIdentifier);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const customer = customers[0];

    // Check if customer has a password set
    if (!customer.password) {
      console.log('❌ No password set for customer:', customer.pkey);
      return res.status(401).json({ error: "Account has no password set. Please register first." });
    }

    // Verify password
    const passwordIsValid = bcrypt.compareSync(password, customer.password);

    if (!passwordIsValid) {
      console.log('❌ Invalid password for customer:', customer.pkey);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate customer token
    const token = jwt.sign(
      {
        customerkey: customer.pkey,
        email: customer.email,
        phone: customer.phone,
        name: customer.fullname,
        type: customer.type || 'customer'
      },
      config.secret,
      { expiresIn: 86400 * 30 } // 30 days
    );

    console.log('✅ Customer logged in:', customer.pkey);

    // Return customer data (without password)
    res.status(200).json({
      message: "Login successful",
      token: token,
      customer: {
        pkey: customer.pkey,
        fullname: customer.fullname,
        email: customer.email,
        phone: customer.phone,
        type: customer.type,
        dateactivated: customer.dateactivated
      }
    });

  } catch (err) {
    console.error("❌ Customer login error:", err);
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
      "SELECT pkey, fullname, email, phone, type, birthday, dateactivated FROM tblcustomer WHERE pkey = :customerkey AND dateinactivated IS NULL",
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
       WHERE customerkey = :customerkey AND dateinactivated IS NULL and bookingstart >= NOW()
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

// Customer registration (public endpoint - no token required)
// POST /api/booking/customer/register
// Body: { fullname, email, phone, password, birthday }
exports._customer_register = async (req, res) => {
  try {
    console.log('📝 Customer registration request:', req.body);

    const { fullname, email, phone, password, birthday } = req.body;

    // Validate required fields (phone optional)
    if (!fullname || !email || !password) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["fullname", "email", "password"]
      });
    }

    // Normalize inputs
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPhone = phone ? String(phone).trim() : null;
    const normalizedBirthday = birthday ? new Date(birthday) : null;

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 8);

    // Check if customer exists by email OR phone
    const existingCustomer = await db.sequelize.query(
      `SELECT pkey, fullname, email, phone, type, dateactivated 
       FROM tblcustomer 
       WHERE (LOWER(email) = :email OR phone = :phone) 
         AND dateinactivated IS NULL 
       LIMIT 1`,
      {
        replacements: { email: normalizedEmail, phone: normalizedPhone },
        type: db.sequelize.QueryTypes.SELECT
      }
    );

    if (existingCustomer && existingCustomer.length > 0) {
      // Customer exists - UPDATE
      const customer = existingCustomer[0];
      console.log('📝 Customer exists, updating:', customer.pkey);

      const updateQuery = `
        UPDATE tblcustomer
        SET fullname = :fullname,
            email = :email,
            phone = COALESCE(:phone, phone),
            password = :password,
            birthday = :birthday,
            type = COALESCE(type, 'member'),
            dateactivated = COALESCE(dateactivated, NOW())
        WHERE pkey = :customerkey
      `;

      await db.sequelize.query(updateQuery, {
        replacements: {
          customerkey: customer.pkey,
          fullname,
          email: normalizedEmail,
          phone: normalizedPhone,
          password: hashedPassword,
          birthday: birthday || null
        },
        type: db.sequelize.QueryTypes.UPDATE
      });

      // Generate token for updated customer
      const token = jwt.sign(
        {
          customerkey: customer.pkey,
          email: normalizedEmail,
          phone: normalizedPhone,
          name: fullname,
          type: 'member'
        },
        config.secret,
        { expiresIn: 86400 * 30 } // 30 days
      );

      console.log('✅ Customer updated:', customer.pkey);

      return res.status(200).json({
        message: "Customer updated successfully",
        token: token,
        customer: {
          pkey: customer.pkey,
          fullname: fullname,
          email: normalizedEmail,
          phone: normalizedPhone,
          birthday: birthday || null,
          type: 'member'
        }
      });
    } else {
      // Customer does NOT exist - CREATE
      console.log('📝 Creating new customer');

      const insertQuery = `
        INSERT INTO tblcustomer (fullname, email, phone, password, birthday, type, dateactivated, numbooking)
        VALUES (:fullname, :email, :phone, :password, :birthday, 'member', NOW(), 0)
      `;

      const result = await db.sequelize.query(insertQuery, {
        replacements: {
          fullname,
          email: normalizedEmail,
          phone: normalizedPhone,
          password: hashedPassword,
          birthday: birthday || null
        },
        type: db.sequelize.QueryTypes.INSERT
      });

      const newCustomerKey = result[0];

      // Generate token for new customer
      const token = jwt.sign(
        {
          customerkey: newCustomerKey,
          email: normalizedEmail,
          phone: normalizedPhone,
          name: fullname,
          type: 'member'
        },
        config.secret,
        { expiresIn: 86400 * 30 } // 30 days
      );

      console.log('✅ Customer created:', newCustomerKey);

      return res.status(201).json({
        message: "Customer registered successfully",
        token: token,
        customer: {
          pkey: newCustomerKey,
          fullname: fullname,
          email: normalizedEmail,
          phone: normalizedPhone,
          birthday: birthday || null,
          type: 'member'
        }
      });
    }

  } catch (err) {
    console.error("❌ Customer registration error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};

// Customer reset password (public)
// POST /api/booking/customer/reset-password
// Body: { email }
exports._customer_reset_password = async (req, res) => {
  try {
    const emailInput = req.body.email || req.body.emailAddress || req.body.customerEmail;
    if (!emailInput) {
      return res.status(400).json({ error: 'Missing email' });
    }

    const email = String(emailInput).trim().toLowerCase();

    // Find customer by email
    const rows = await db.sequelize.query(
      "SELECT pkey, fullname, email FROM tblcustomer WHERE LOWER(email) = :email AND dateinactivated IS NULL LIMIT 1",
      { replacements: { email }, type: db.sequelize.QueryTypes.SELECT }
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'No customer account found for that email' });
    }

    const customer = rows[0];

    // Generate a temporary password (8 characters)
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).charAt(2);
    const hashed = bcrypt.hashSync(tempPassword, 8);

    // Update customer's password in DB
    await db.sequelize.query(
      "UPDATE tblcustomer SET password = :password, dateactivated = COALESCE(dateactivated, NOW()) WHERE pkey = :pkey",
      { replacements: { password: hashed, pkey: customer.pkey }, type: db.sequelize.QueryTypes.UPDATE }
    );

    // Send email with temporary password
    try {
      const emailResult = await notifications.sendPasswordResetEmail({
        customeremail: customer.email,
        customername: customer.fullname || '',
        password: tempPassword
      });

      if (!emailResult || emailResult.success === false) {
        console.warn('⚠️ Password reset: email may not have been sent', emailResult);
      }
    } catch (e) {
      console.error('❌ Error sending password reset email:', e);
    }

    return res.status(200).json({ message: 'Temporary password generated and emailed if the address exists' });
  } catch (err) {
    console.error('❌ Reset password error:', err);
    return res.status(500).json({ error: 'Internal Server Error', details: err.message });
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
    const isUpdating = bookingkey && Number(bookingkey) > 0;

    // ✅ Only resolve/create customer for NEW bookings
    if (!isUpdating && !resolvedCustomerKey) {
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
          // Email exists — reuse customer record and update phone if provided instead of inserting duplicate
          try {
            if (phone) {
              await db.sequelize.query(
                "UPDATE tblcustomer SET phone = :phone WHERE pkey = :pkey",
                { replacements: { phone, pkey: resolvedCustomerKey }, type: db.sequelize.QueryTypes.UPDATE }
              );
              console.log('✅ Updated existing customer phone for pkey:', resolvedCustomerKey);
            }
          } catch (e) {
            console.warn('⚠️ Could not update phone for existing customer pkey=', resolvedCustomerKey, e && e.message);
          }
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
    } else if (isUpdating && !resolvedCustomerKey) {
      // ✅ For updates, get the existing customerkey from the booking
      console.log('⚠️ No customerkey provided for update, fetching from existing booking');
      const existingBooking = await db.sequelize.query(
        "SELECT customerkey FROM tblbooking WHERE pkey = :bookingkey LIMIT 1",
        {
          replacements: { bookingkey: Number(bookingkey) },
          type: db.sequelize.QueryTypes.SELECT
        }
      );
      if (existingBooking && existingBooking.length > 0) {
        resolvedCustomerKey = existingBooking[0].customerkey;
        console.log('✅ Using existing customerkey:', resolvedCustomerKey);
      } else {
        return res.status(404).json({ error: "Booking not found" });
      }
    }

    // ✅ Validate that we have a customer
    if (!resolvedCustomerKey) {
      return res.status(400).json({ error: "Unable to determine customer" });
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
    let isNewBooking = false;

    if (isUpdating) {
      // UPDATE existing booking
      console.log('📝 Updating booking:', bookingkey, 'with customerkey:', resolvedCustomerKey);

      // ✅ Fetch customer email and phone from tblcustomer
      const customerInfo = await db.sequelize.query(
        "SELECT email, phone, fullname FROM tblcustomer WHERE pkey = :customerkey LIMIT 1",
        {
          replacements: { customerkey: resolvedCustomerKey },
          type: db.sequelize.QueryTypes.SELECT
        }
      );

      let finalEmail = customeremail;
      let finalPhone = customerphone;
      let finalName = customername;

      if (customerInfo && customerInfo.length > 0) {
        finalEmail = customerInfo[0].email;
        finalPhone = customerInfo[0].phone;
        finalName = finalName || customerInfo[0].fullname;
        console.log('✅ Customer info from database:', {
          email: finalEmail,
          phone: finalPhone,
          name: finalName
        });
      }

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
          customeremail: finalEmail,
          customerphone: finalPhone,
          datetime: bookingStart,
          bookingstart: bookingStart,
          bookingend: bookingEndStr,
          note,
          customername: finalName,
          staffname,
          servicename,
          userkey,
        },
        type: db.sequelize.QueryTypes.UPDATE,
      });

      newBookingKey = Number(bookingkey);

      console.log('✅ Booking updated, preparing notifications...');

      // ✅ Generate customer token for modified booking
      const customerToken = jwt.sign(
        {
          customerkey: resolvedCustomerKey,
          email: finalEmail,
          phone: finalPhone,
          name: finalName,
          type: 'customer'
        },
        config.secret,
        { expiresIn: 86400 * 30 }
      );

      // ✅ Send modification notifications using customer info from database
      if (finalEmail || finalPhone) {
        console.log('📬 Sending modification notifications to:', {
          email: finalEmail,
          phone: finalPhone
        });

        const notificationData = {
          bookingkey: newBookingKey,
          customername: finalName || 'Guest',
          customeremail: finalEmail,
          customerphone: finalPhone,
          datetime: formatDatetimeForDisplay(bookingStart),
          servicename: servicename || 'Service',
          staffname: staffname || 'Staff',
          token: customerToken
        };

        console.log('📦 Notification data:', notificationData);

        Promise.all([
          notifications.sendBookingModificationEmail(notificationData),
          notifications.sendBookingModificationSMS(notificationData)
        ]).then(results => {
          console.log('📬 Modification notification results:', results);
        }).catch(err => {
          console.error('⚠️ Modification notification error (non-critical):', err);
        });
      } else {
        console.log('⚠️ No email or phone found in customer record');
      }

    } else {
      // INSERT new booking
      console.log('✨ Creating new booking with customerkey:', resolvedCustomerKey);

      const insertQuery = `
        INSERT INTO tblbooking 
        (customerkey, servicekey, staffkey, date, datetime, bookingstart, bookingend, 
         customeremail, customerphone,
         dateactivated, note, customername, staffname, servicename, userkey, createdby)
        VALUES 
        (:customerkey, :servicekey, :staffkey, CURDATE(), NOW(), :bookingstart, :bookingend, 
         :customeremail, :customerphone,
         NOW(), :note, :customername, :staffname, :servicename, :userkey, 'customer')
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
      isNewBooking = true;

      // ✅ Increment numbooking for customer
      await db.sequelize.query(
        "UPDATE tblcustomer SET numbooking = numbooking + 1 WHERE pkey = :customerkey",
        {
          replacements: { customerkey: resolvedCustomerKey },
          type: db.sequelize.QueryTypes.UPDATE
        }
      );

      console.log('✅ Incremented numbooking for customer:', resolvedCustomerKey);

      // ✅ Fetch customer info from tblcustomer for email notifications
      const customerInfo = await db.sequelize.query(
        "SELECT email, phone, fullname FROM tblcustomer WHERE pkey = :customerkey LIMIT 1",
        {
          replacements: { customerkey: resolvedCustomerKey },
          type: db.sequelize.QueryTypes.SELECT
        }
      );

      let finalEmail = customeremail;
      let finalPhone = customerphone;
      let finalName = customername;

      if (customerInfo && customerInfo.length > 0) {
        finalEmail = finalEmail || customerInfo[0].email;
        finalPhone = finalPhone || customerInfo[0].phone;
        finalName = finalName || customerInfo[0].fullname;
        console.log('✅ Customer info from database for new booking:', {
          email: finalEmail,
          phone: finalPhone,
          name: finalName
        });
      }

      // ✅ Generate customer token for new booking
      const customerToken = jwt.sign(
        {
          customerkey: resolvedCustomerKey,
          email: finalEmail,
          phone: finalPhone,
          name: finalName,
          type: 'customer'
        },
        config.secret,
        { expiresIn: 86400 * 30 }
      );

      // ✅ Send confirmation notifications (only for new bookings)
      if (finalEmail || finalPhone) {
        console.log('📬 Sending confirmation notifications to:', {
          email: finalEmail,
          phone: finalPhone
        });

        const notificationData = {
          bookingkey: newBookingKey,
          customername: finalName || 'Guest',
          customeremail: finalEmail,
          customerphone: finalPhone,
          datetime: formatDatetimeForDisplay(bookingStart),
          servicename: servicename || 'Service',
          staffname: staffname || 'Staff',
          token: customerToken
        };

        console.log('📦 Notification data:', notificationData);

        Promise.all([
          notifications.sendBookingEmail(notificationData),
          notifications.sendBookingSMS(notificationData)
        ]).then(results => {
          console.log('📬 Confirmation notification results:', results);
        }).catch(err => {
          console.error('⚠️ Confirmation notification error (non-critical):', err);
        });
      } else {
        console.log('⚠️ No email or phone found in customer record for new booking');
      }
    }

    // Generate customer token (for response)
    const customerToken = jwt.sign(
      {
        customerkey: resolvedCustomerKey,
        email: customeremail,
        phone: customerphone,
        name: customername,
        type: 'customer'
      },
      config.secret,
      { expiresIn: 86400 * 30 }
    );

    return res.status(isNewBooking ? 201 : 200).json({
      message: isNewBooking ? "Booking added successfully" : "Booking updated successfully",
      bookingkey: newBookingKey,
      customerkey: resolvedCustomerKey,
      token: customerToken
    });

  } catch (err) {
    console.error("Database Save Error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};

// Email cancel endpoint - cancels booking directly via email link
// GET /api/booking/email-cancel?bookingkey=123&token=xyz
exports._email_cancel_booking = async (req, res) => {
  try {
    const { bookingkey, token } = req.query;

    console.log('🚫 Email cancel request:', { bookingkey });

    if (!bookingkey || !token) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Error - Missing Information</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #F44336; font-size: 24px; margin: 20px 0; }
            .message { color: #666; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="error">❌ Error</div>
          <div class="message">Missing booking information. Please use the link from your email.</div>
        </body>
        </html>
      `);
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, config.secret);
      console.log('✅ Token verified:', decoded);
    } catch (verifyErr) {
      console.error('❌ Token verification failed:', verifyErr.message);
      return res.status(401).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Error - Invalid Link</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #F44336; font-size: 24px; margin: 20px 0; }
            .message { color: #666; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="error">❌ Invalid or Expired Link</div>
          <div class="message">This cancellation link is no longer valid. Please contact us directly.</div>
        </body>
        </html>
      `);
    }

    // Get booking details before cancellation
    const bookingCheck = await db.sequelize.query(
      `SELECT pkey, customerkey, datetime, bookingstart, customername, customeremail, 
              customerphone, servicename, staffname
       FROM tblbooking 
       WHERE pkey = :bookingkey 
         AND customerkey = :customerkey 
         AND dateinactivated IS NULL`,
      {
        replacements: {
          bookingkey: Number(bookingkey),
          customerkey: decoded.customerkey
        },
        type: db.sequelize.QueryTypes.SELECT
      }
    );

    if (!bookingCheck || bookingCheck.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Booking Not Found</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #FF9800; font-size: 24px; margin: 20px 0; }
            .message { color: #666; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="error">⚠️ Booking Not Found</div>
          <div class="message">This booking has already been cancelled or does not exist.</div>
        </body>
        </html>
      `);
    }

    const booking = bookingCheck[0];

    // Check if booking is in the past
    const bookingTime = new Date(booking.bookingstart || booking.datetime);
    if (bookingTime < new Date()) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Cannot Cancel</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #F44336; font-size: 24px; margin: 20px 0; }
            .message { color: #666; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="error">❌ Cannot Cancel</div>
          <div class="message">This booking is in the past and cannot be cancelled.</div>
        </body>
        </html>
      `);
    }

    // Cancel the booking
    const cancelQuery = `
      UPDATE tblbooking
      SET status = 'cancelled',
          dateinactivated = NOW()
      WHERE pkey = :bookingkey
    `;

    await db.sequelize.query(cancelQuery, {
      replacements: { bookingkey: Number(bookingkey) },
      type: db.sequelize.QueryTypes.UPDATE,
    });

    console.log('✅ Booking cancelled via email:', bookingkey);

    // Get salon info for success page
    const salonInfo = await db.sequelize.query(
      `SELECT name, phone, email FROM tblsalon WHERE pkey = :salonkey AND dateinactivated IS NULL LIMIT 1`,
      {
        replacements: { salonkey: process.env.SALON_KEY || 1 },
        type: db.sequelize.QueryTypes.SELECT
      }
    );

    const salon = salonInfo && salonInfo.length > 0 ? salonInfo[0] : { name: 'Salon', phone: '', email: '' };
    const bookAgainUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Return success page
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Booking Cancelled</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            max-width: 600px; 
            margin: 50px auto; 
            padding: 20px; 
            text-align: center;
            background-color: #f5f5f5;
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .success { color: #4CAF50; font-size: 48px; margin: 20px 0; }
          .title { color: #333; font-size: 24px; margin: 20px 0; font-weight: bold; }
          .message { color: #666; margin: 20px 0; line-height: 1.6; }
          .details {
            background-color: #FFEBEE;
            padding: 20px;
            border-radius: 5px;
            margin: 20px 0;
            border-left: 4px solid #F44336;
            text-align: left;
          }
          .details p { margin: 10px 0; color: #333; }
          .button {
            display: inline-block;
            background-color: #4CAF50;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 10px;
            font-weight: bold;
          }
          .contact {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            color: #666;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅</div>
          <div class="title">Booking Cancelled Successfully</div>
          <div class="message">Your booking has been cancelled.</div>
          
          <div class="details">
            <p><strong>Booking ID:</strong> #${bookingkey}</p>
            <p><strong>Service:</strong> ${booking.servicename || 'N/A'}</p>
            <p><strong>Staff:</strong> ${booking.staffname || 'N/A'}</p>
            <p><strong>Date & Time:</strong> ${formatDatetimeForDisplay(booking.bookingstart || booking.datetime)}</p>
          </div>
          
          <div class="message">
            We're sorry to see you cancel. If you'd like to book again, we'd be happy to help you.
          </div>
          
          <a href="${bookAgainUrl}" class="button">📅 Book Again</a>
          
          <div class="contact">
            <strong>${salon.name}</strong><br>
            ${salon.phone ? `📞 ${salon.phone}<br>` : ''}
            ${salon.email ? `📧 ${salon.email}` : ''}
          </div>
        </div>
      </body>
      </html>
    `);

  } catch (err) {
    console.error("❌ Email cancel booking error:", err);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
          .error { color: #F44336; font-size: 24px; margin: 20px 0; }
          .message { color: #666; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="error">❌ Error</div>
        <div class="message">An error occurred while cancelling your booking. Please try again or contact us.</div>
      </body>
      </html>
    `);
  }
};

// Email redirect handlers for modify and view
exports._email_redirect_modify = async (req, res) => {
  const { bookingkey, token } = req.query;
  const flutterUrl = process.env.FLUTTER_URL || 'http://localhost:3000';
  res.redirect(`${flutterUrl}/booking/modify?bookingkey=${bookingkey}&token=${encodeURIComponent(token)}`);
};

exports._email_redirect_view = async (req, res) => {
  const { bookingkey, token } = req.query;
  const flutterUrl = process.env.FLUTTER_URL || 'http://localhost:3000';
  res.redirect(`${flutterUrl}/booking/view?bookingkey=${bookingkey}&token=${encodeURIComponent(token)}`);
};

// Add new customer (public endpoint)
// POST /api/booking/customer/add
// Body: { fullname, email, phone, dob }
exports._add_customer = async (req, res) => {
  try {
    console.log('👤 Add customer request:', req.body);

    const { fullname, email, phone, dob } = req.body;

    // Validate required fields
    if (!fullname) {
      return res.status(400).json({
        error: "Missing required field: fullname"
      });
    }

    // Normalize inputs
    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
    const normalizedPhone = phone ? String(phone).trim() : null;
    const normalizedDob = dob || null;

    // Check if customer already exists (by email or phone)
    if (normalizedEmail || normalizedPhone) {
      let checkQuery = "SELECT pkey, fullname, email, phone FROM tblcustomer WHERE dateinactivated IS NULL";
      const replacements = {};
      const conditions = [];

      if (normalizedEmail) {
        conditions.push("LOWER(email) = :email");
        replacements.email = normalizedEmail;
      }

      if (normalizedPhone) {
        conditions.push("phone = :phone");
        replacements.phone = normalizedPhone;
      }

      if (conditions.length > 0) {
        checkQuery += " AND (" + conditions.join(" OR ") + ")";
      }

      checkQuery += " LIMIT 1";

      const existingCustomer = await db.sequelize.query(checkQuery, {
        replacements,
        type: db.sequelize.QueryTypes.SELECT
      });

      if (existingCustomer && existingCustomer.length > 0) {
        console.log('⚠️ Customer already exists:', existingCustomer[0].pkey);
        return res.status(409).json({
          error: "Customer already exists",
          customerkey: existingCustomer[0].pkey,
          customer: existingCustomer[0]
        });
      }
    }

    // Insert new customer
    const insertQuery = `
      INSERT INTO tblcustomer 
      (fullname, email, phone, birthday, type, dateactivated, numbooking, createdby)
      VALUES 
      (:fullname, :email, :phone, :birthday, 'customer', NOW(), 0, 'salon')
    `;

    const result = await db.sequelize.query(insertQuery, {
      replacements: {
        fullname: fullname,
        email: normalizedEmail,
        phone: normalizedPhone,
        birthday: normalizedDob
      },
      type: db.sequelize.QueryTypes.INSERT
    });

    const newCustomerKey = result[0];

    console.log('✅ Customer created:', newCustomerKey);

    // Fetch the newly created customer
    const newCustomer = await db.sequelize.query(
      "SELECT pkey, fullname, email, phone, birthday, type, dateactivated FROM tblcustomer WHERE pkey = :customerkey",
      {
        replacements: { customerkey: newCustomerKey },
        type: db.sequelize.QueryTypes.SELECT
      }
    );

    return res.status(201).json({
      message: "Customer added successfully",
      customerkey: newCustomerKey,
      customer: newCustomer[0]
    });

  } catch (err) {
    console.error("❌ Add customer error:", err);
    res.status(500).json({
      error: "Internal Server Error",
      details: err.message
    });
  }
};


