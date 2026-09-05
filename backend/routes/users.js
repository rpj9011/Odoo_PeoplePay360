// backend/routes/users.js

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const multer = require('multer');
const User = require('../models/User'); // Adjust path as needed
const authenticateToken = require('../middleware/authenticateToken'); // Your primary authentication middleware
const upload = require('../middleware/upload'); // Our new upload middleware

// @route   GET /api/users/profile
// @desc    Get the current user's profile
// @access  Private
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .populate('shiftGroup', 'shiftName startTime endTime durationHours paidBreakMinutes')
            .lean();
        
        // Manually populate reportingPerson if it's a valid ObjectId
        if (user && user.reportingPerson && mongoose.Types.ObjectId.isValid(user.reportingPerson)) {
            const reportingPerson = await User.findById(user.reportingPerson)
                .select('fullName email department')
                .lean();
            user.reportingPerson = reportingPerson || null;
        } else if (user) {
            user.reportingPerson = null;
        }

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Return user profile data
        res.json({
            _id: user._id,
            fullName: user.fullName,
            employeeCode: user.employeeCode,
            email: user.email,
            role: user.role,
            designation: user.designation,
            department: user.department,
            joiningDate: user.joiningDate,
            profileImageUrl: user.profileImageUrl,
            personalDetails: user.personalDetails || {},
            identityDetails: user.identityDetails || {},
            reportingPerson: user.reportingPerson || {},
            shiftGroup: user.shiftGroup
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch profile.' });
    }
});

// @route   PUT /api/user/update-profile
// @desc    Update the current user's profile
// @access  Private
router.put('/update-profile', authenticateToken, async (req, res) => {
    try {
        const { personalDetails, identityDetails } = req.body;
        const user = await User.findById(req.user.userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Update personal details
        if (personalDetails) {
            user.personalDetails = {
                ...user.personalDetails,
                ...personalDetails
            };
        }

        // Update identity details
        if (identityDetails) {
            user.identityDetails = {
                ...user.identityDetails,
                ...identityDetails
            };
        }

        await user.save();

        // Return updated user
        const updatedUser = await User.findById(req.user.userId)
            .populate('shiftGroup', 'shiftName startTime endTime durationHours paidBreakMinutes')
            .lean();
        
        // Manually populate reportingPerson if it's a valid ObjectId
        if (updatedUser && updatedUser.reportingPerson && mongoose.Types.ObjectId.isValid(updatedUser.reportingPerson)) {
            const reportingPerson = await User.findById(updatedUser.reportingPerson)
                .select('fullName email department')
                .lean();
            updatedUser.reportingPerson = reportingPerson || null;
        } else if (updatedUser) {
            updatedUser.reportingPerson = null;
        }

        res.json({
            message: 'Profile updated successfully.',
            user: {
                _id: updatedUser._id,
                fullName: updatedUser.fullName,
                employeeCode: updatedUser.employeeCode,
                email: updatedUser.email,
                role: updatedUser.role,
                designation: updatedUser.designation,
                department: updatedUser.department,
                joiningDate: updatedUser.joiningDate,
                profileImageUrl: updatedUser.profileImageUrl,
                personalDetails: updatedUser.personalDetails || {},
                identityDetails: updatedUser.identityDetails || {},
                reportingPerson: updatedUser.reportingPerson || {},
                shiftGroup: updatedUser.shiftGroup
            }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

// @route   POST /api/users/upload-avatar
// @desc    Upload or update a profile picture for the logged-in user
// @access  Private
router.post(
    '/upload-avatar',
    authenticateToken, // 1. Authenticate user to get user details on `req.user`
    upload.single('profileImage'), // 2. Process a single file upload with the field name 'profileImage'
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'File not provided or invalid file type. Please upload an image.' });
            }

            const user = await User.findById(req.user.userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found.' });
            }

            // --- THIS LOGIC IS NOW CORRECT AND ROBUST ---
            // It will prioritize the .env variable. If that's not set, it will now correctly
            // use `https` from `req.protocol` because we enabled 'trust proxy' in server.js.
            const baseUrl = process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
            const imageUrl = `${baseUrl}/avatars/${req.file.filename}`;

            // Update the user's document with the new, correct image URL
            user.profileImageUrl = imageUrl;
            await user.save();

            res.json({
                message: 'Profile image uploaded successfully.',
                imageUrl: user.profileImageUrl
            });

        } catch (error) {
            console.error('Avatar Upload Error:', error);
            if (error.message && error.message.includes('Images Only')) {
                return res.status(400).json({ error: 'Invalid file type. Only jpeg, jpg, png, or gif are allowed.' });
            }
            res.status(500).json({ error: 'Server error while uploading image.' });
        }
    }
);

module.exports = router;