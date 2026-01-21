const db = require("../models");

exports.addstaff = async (req, res) => {
    try {
        const { fullname, phone, email, dob } = req.body;

        // Validate required fields
        if (!fullname || !phone || !email) {
            return res.status(400).json({
                error: "Missing required fields: fullname, phone, email"
            });
        }

        // Insert staff into tblstaff
        const result = await db.sequelize.query(
            `INSERT INTO tblstaff (fullname, phone, email, birthday, dateactivated) 
       VALUES (:fullname, :phone, :email, :dob, NOW())`,
            {
                replacements: {
                    fullname: String(fullname).trim(),
                    phone: String(phone).trim(),
                    email: String(email).trim().toLowerCase(),
                    dob: dob || null
                },
                type: db.sequelize.QueryTypes.INSERT
            }
        );

        res.status(201).json({
            message: "Staff added successfully",
            pkey: result[0],
            fullname,
            phone,
            email,
            dob
        });
    } catch (err) {
        console.error("Error adding staff:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.liststaff = async (req, res) => {
    try {
        const staff = await db.sequelize.query(
            `SELECT pkey, fullname, phone, email, birthday, photo, location, username, datelastactivated 
       FROM tblstaff 
       WHERE dateinactivated IS NULL 
       ORDER BY fullname ASC`,
            {
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        res.status(200).json(staff);
    } catch (err) {
        console.error("Error fetching staff:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.getstaff = async (req, res) => {
    try {
        const { pkey } = req.params;

        const staff = await db.sequelize.query(
            `SELECT * FROM tblstaff WHERE pkey = :pkey AND dateinactivated IS NULL`,
            {
                replacements: { pkey },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        if (staff.length === 0) {
            return res.status(404).json({ error: "Staff not found" });
        }

        res.status(200).json(staff[0]);
    } catch (err) {
        console.error("Error fetching staff:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.updatestaff = async (req, res) => {
    try {
        const { pkey } = req.params;
        const { fullname, phone, email, dob } = req.body;

        // Check if staff exists
        const existingStaff = await db.sequelize.query(
            `SELECT pkey FROM tblstaff WHERE pkey = :pkey AND dateinactivated IS NULL`,
            {
                replacements: { pkey },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        if (existingStaff.length === 0) {
            return res.status(404).json({ error: "Staff not found" });
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

        const updateQuery = `UPDATE tblstaff SET ${updates.join(", ")} WHERE pkey = :pkey`;

        await db.sequelize.query(updateQuery, {
            replacements,
            type: db.sequelize.QueryTypes.UPDATE
        });

        res.status(200).json({
            message: "Staff updated successfully",
            pkey
        });
    } catch (err) {
        console.error("Error updating staff:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.activatestaff = async (req, res) => {
    try {
        const { pkey } = req.params;
        const { active } = req.body;

        // Validate active parameter
        if (typeof active !== 'boolean') {
            return res.status(400).json({ error: "active field must be a boolean" });
        }

        // Check if staff exists
        const existingStaff = await db.sequelize.query(
            `SELECT pkey FROM tblstaff WHERE pkey = :pkey`,
            {
                replacements: { pkey },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        if (existingStaff.length === 0) {
            return res.status(404).json({ error: "Staff not found" });
        }

        // Update staff active status
        if (active) {
            // Activate: set dateinactivated to null
            await db.sequelize.query(
                `UPDATE tblstaff SET datelastactivated = NULL WHERE pkey = :pkey`,
                {
                    replacements: { pkey },
                    type: db.sequelize.QueryTypes.UPDATE
                }
            );
        } else {
            // Deactivate: set dateinactivated to NOW()
            await db.sequelize.query(
                `UPDATE tblstaff SET datelastactivated = NOW() WHERE pkey = :pkey`,
                {
                    replacements: { pkey },
                    type: db.sequelize.QueryTypes.UPDATE
                }
            );
        }

        res.status(200).json({
            message: active ? "Staff activated successfully" : "Staff deactivated successfully",
            pkey,
            active
        });
    } catch (err) {
        console.error("Error updating staff status:", err);
        res.status(500).json({ error: err.message });
    }
};
