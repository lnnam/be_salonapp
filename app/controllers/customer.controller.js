const db = require("../models");

exports.addcustomer = async (req, res) => {
    try {
        const { fullname, phone, email, dob } = req.body;

        // Validate required fields
        if (!fullname || !phone || !email) {
            return res.status(400).json({
                error: "Missing required fields: fullname, phone, email"
            });
        }

        // Insert customer into tblcustomer
        const result = await db.sequelize.query(
            `INSERT INTO tblcustomer (fullname, phone, email, birthday, dateactivated) 
       VALUES (:fullname, :phone, :email, :birthday, NOW())`,
            {
                replacements: {
                    fullname: String(fullname).trim(),
                    phone: String(phone).trim(),
                    email: String(email).trim().toLowerCase(),
                    birthday: dob || null
                },
                type: db.sequelize.QueryTypes.INSERT
            }
        );

        res.status(201).json({
            message: "Customer added successfully",
            pkey: result[0],
            fullname,
            phone,
            email,
            dob
        });
    } catch (err) {
        console.error("Error adding customer:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.listcustomer = async (req, res) => {
    try {
        const customers = await db.sequelize.query(
            `SELECT pkey, fullname, phone, email, birthday, photobase64, location, username, dateinactivated as datelastactivated 
       FROM tblcustomer 
       WHERE 1
       ORDER BY fullname ASC`,
            {
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        res.status(200).json(customers);
    } catch (err) {
        console.error("Error fetching customers:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.listcustomerupcomingbirthday = async (req, res) => {
    try {
        const customers = await db.sequelize.query(
            `SELECT pkey, fullname, phone, email, birthday, photobase64, location, username, dateinactivated as datelastactivated 
       FROM tblcustomer 
       WHERE birthday IS NOT NULL
       AND dateinactivated IS NULL
       AND DATEDIFF(
           STR_TO_DATE(
               CONCAT(
                   IF(
                       DATE_FORMAT(CURDATE(), '%m-%d') <= DATE_FORMAT(birthday, '%m-%d'),
                       YEAR(CURDATE()),
                       YEAR(CURDATE()) + 1
                   ),
                   '-',
                   DATE_FORMAT(birthday, '%m-%d')
               ),
               '%Y-%m-%d'
           ),
           CURDATE()
       ) BETWEEN 0 AND 21
       ORDER BY DATE_FORMAT(birthday, '%m-%d') ASC`,
            {
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        res.status(200).json(customers);
    } catch (err) {
        console.error("Error fetching customers with upcoming birthdays:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.getcustomer = async (req, res) => {
    try {
        const { pkey } = req.params;

        const customer = await db.sequelize.query(
            `SELECT * FROM tblcustomer WHERE pkey = :pkey `,
            {
                replacements: { pkey },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        if (customer.length === 0) {
            return res.status(404).json({ error: "Customer not found" });
        }

        res.status(200).json(customer[0]);
    } catch (err) {
        console.error("Error fetching customer:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.updatecustomer = async (req, res) => {
    try {
        const { pkey } = req.params;
        const { fullname, phone, email, dob } = req.body;

        // Check if customer exists
        const existingCustomer = await db.sequelize.query(
            `SELECT pkey FROM tblcustomer WHERE pkey = :pkey `,
            {
                replacements: { pkey },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        if (existingCustomer.length === 0) {
            return res.status(404).json({ error: "Customer not found" });
        }

        // Build dynamic update query
        const updates = [];
        const replacements = { pkey };

        if (fullname !== undefined) {
            updates.push(`fullname = :fullname`);
            replacements.fullname = String(fullname).trim();
        }
        if (phone !== undefined) {
            updates.push(`phone = :phone`);
            replacements.phone = String(phone).trim();
        }
        if (email !== undefined) {
            updates.push(`email = :email`);
            replacements.email = String(email).trim().toLowerCase();
        }
        if (dob !== undefined) {
            updates.push(`birthday = :dob`);
            replacements.dob = dob || null;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: "No fields to update" });
        }

        const updateQuery = `UPDATE tblcustomer SET ${updates.join(", ")} WHERE pkey = :pkey`;

        await db.sequelize.query(updateQuery, {
            replacements,
            type: db.sequelize.QueryTypes.UPDATE
        });

        res.status(200).json({
            message: "Customer updated successfully",
            pkey
        });
    } catch (err) {
        console.error("Error updating customer:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.activatecustomer = async (req, res) => {
    try {
        const { pkey } = req.params;
        const { active } = req.body;

        // Validate active parameter
        if (typeof active !== 'boolean') {
            return res.status(400).json({ error: "active field must be a boolean" });
        }

        // Check if customer exists
        const existingCustomer = await db.sequelize.query(
            `SELECT pkey FROM tblcustomer WHERE pkey = :pkey`,
            {
                replacements: { pkey },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        if (existingCustomer.length === 0) {
            return res.status(404).json({ error: "Customer not found" });
        }

        // Update customer active status
        if (active) {
            // Activate: set dateinactivated to null
            await db.sequelize.query(
                `UPDATE tblcustomer SET dateinactivated = NULL WHERE pkey = :pkey`,
                {
                    replacements: { pkey },
                    type: db.sequelize.QueryTypes.UPDATE
                }
            );
        } else {
            // Deactivate: set dateinactivated to NOW()
            await db.sequelize.query(
                `UPDATE tblcustomer SET dateinactivated = NOW() WHERE pkey = :pkey`,
                {
                    replacements: { pkey },
                    type: db.sequelize.QueryTypes.UPDATE
                }
            );
        }

        res.status(200).json({
            message: active ? "Customer activated successfully" : "Customer deactivated successfully",
            pkey,
            active
        });
    } catch (err) {
        console.error("Error updating customer status:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.deletecustomer = async (req, res) => {
    try {
        const { pkey } = req.params;

        // Check if customer exists
        const existingCustomer = await db.sequelize.query(
            `SELECT pkey FROM tblcustomer WHERE pkey = :pkey`,
            {
                replacements: { pkey },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        if (existingCustomer.length === 0) {
            return res.status(404).json({ error: "Customer not found" });
        }

        // Delete customer
        await db.sequelize.query(
            `DELETE FROM tblcustomer WHERE pkey = :pkey`,
            {
                replacements: { pkey },
                type: db.sequelize.QueryTypes.DELETE
            }
        );

        res.status(200).json({
            message: "Customer deleted successfully",
            pkey
        });
    } catch (err) {
        console.error("Error deleting customer:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.listbooking = async (req, res) => {
    try {
        const { pkey } = req.params;

        // Check if customer exists
        const existingCustomer = await db.sequelize.query(
            `SELECT pkey FROM tblcustomer WHERE pkey = :pkey`,
            {
                replacements: { pkey },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        if (existingCustomer.length === 0) {
            return res.status(404).json({ error: "Customer not found" });
        }

        // Get all bookings for this customer
        const bookings = await db.sequelize.query(
            `SELECT pkey, status, servicekey, staffkey, datetime, bookingstart, bookingend, 
                    note, customername, staffname, servicename, dateactivated
             FROM tblbooking 
             WHERE customerkey = :pkey AND dateinactivated IS NULL
             ORDER BY bookingstart DESC`,
            {
                replacements: { pkey },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        res.status(200).json({
            message: "Bookings retrieved successfully",
            pkey,
            count: bookings.length,
            bookings
        });
    } catch (err) {
        console.error("Error fetching customer bookings:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.setvip = async (req, res) => {
    try {
        const { pkey } = req.params;
        const { isvip } = req.body;

        // Validate isvip parameter
        if (isvip === undefined) {
            return res.status(400).json({ error: "isvip field is required" });
        }

        // Check if customer exists
        const existingCustomer = await db.sequelize.query(
            `SELECT pkey FROM tblcustomer WHERE pkey = :pkey`,
            {
                replacements: { pkey },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        if (existingCustomer.length === 0) {
            return res.status(404).json({ error: "Customer not found" });
        }

        // Update customer type based on isvip parameter
        const typeValue = isvip === 1 ? 1 : null;
        await db.sequelize.query(
            `UPDATE tblcustomer SET type = :type WHERE pkey = :pkey`,
            {
                replacements: { pkey, type: typeValue },
                type: db.sequelize.QueryTypes.UPDATE
            }
        );

        res.status(200).json({
            message: isvip === 1 ? "Customer set as VIP successfully" : "Customer VIP status removed successfully",
            pkey,
            isvip
        });
    } catch (err) {
        console.error("Error updating customer VIP status:", err);
        res.status(500).json({ error: err.message });
    }
};
