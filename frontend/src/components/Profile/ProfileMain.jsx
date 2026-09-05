import CountryCodeSelect from './CountryCodeSelect';
import DateSelectInput from './DateSelectInput';

const SectionIcon = ({ children }) => (
    <div className="pm-section-icon">{children}</div>
);

const ProfileMain = ({ user, formData, onFieldChange, onSave, saving }) => {
    return (
        <div className="pm-wrap">

            {/* ── Team & Reporting ─────────────────────────────── */}
            <div className="pm-card">
                <div className="pm-card-header">
                    <SectionIcon>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </SectionIcon>
                    <div>
                        <h3 className="pm-card-title">Team &amp; Reporting</h3>
                        <p className="pm-card-subtitle">Your direct reporting line and manager contact.</p>
                    </div>
                </div>

                <div className="pm-info-grid">
                    <div className="pm-info-item">
                        <span className="pm-info-label">Reporting Manager</span>
                        <span className="pm-info-value">{user?.reportingPerson?.fullName || '—'}</span>
                    </div>
                    <div className="pm-info-item">
                        <span className="pm-info-label">Manager Email</span>
                        <span className="pm-info-value pm-info-value--email">{user?.reportingPerson?.email || '—'}</span>
                    </div>
                    <div className="pm-info-item">
                        <span className="pm-info-label">Manager Department</span>
                        <span className="pm-info-value">{user?.reportingPerson?.department || '—'}</span>
                    </div>
                </div>
            </div>

            {/* ── Personal Details ─────────────────────────────── */}
            <div className="pm-card">
                <div className="pm-card-header">
                    <SectionIcon>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </SectionIcon>
                    <div>
                        <h3 className="pm-card-title">Personal Details</h3>
                        <p className="pm-card-subtitle">HR uses this to reach you or your emergency contacts.</p>
                    </div>
                </div>

                <div className="pm-field-section-label">Contact Information</div>

                <div className="pm-form-grid">
                    <div className="pm-field pm-field--date">
                        <label className="pm-label">Date of Birth</label>
                        <DateSelectInput
                            value={formData.dateOfBirth}
                            onChange={(val) => onFieldChange('dateOfBirth', val)}
                        />
                    </div>
                    <div className="pm-field pm-field--sm">
                        <label className="pm-label">Gender</label>
                        <select
                            className="pm-input"
                            value={formData.gender}
                            onChange={(e) => onFieldChange('gender', e.target.value)}
                        >
                            <option value="">Select</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div className="pm-field pm-field--sm">
                        <label className="pm-label">Blood Group</label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.bloodGroup}
                            onChange={(e) => onFieldChange('bloodGroup', e.target.value)}
                            placeholder="e.g. A+"
                        />
                    </div>
                    <div className="pm-field pm-field--sm">
                        <label className="pm-label">Marital Status</label>
                        <select
                            className="pm-input"
                            value={formData.maritalStatus}
                            onChange={(e) => onFieldChange('maritalStatus', e.target.value)}
                        >
                            <option value="">Select</option>
                            <option value="Single">Single</option>
                            <option value="Married">Married</option>
                            <option value="Divorced">Divorced</option>
                            <option value="Widowed">Widowed</option>
                        </select>
                    </div>

                    <div className="pm-field pm-field--phone">
                        <label className="pm-label">Phone Number</label>
                        <div className="pm-phone-row">
                            <div className="pm-phone-code">
                                <CountryCodeSelect
                                    value={formData.phoneCountryCode}
                                    onChange={(e) => onFieldChange('phoneCountryCode', e.target.value)}
                                />
                            </div>
                            <input
                                className="pm-input pm-phone-number"
                                type="tel"
                                value={formData.phoneNumber}
                                onChange={(e) => onFieldChange('phoneNumber', e.target.value)}
                                placeholder="10-digit number"
                                maxLength={10}
                            />
                        </div>
                    </div>

                    <div className="pm-field pm-field--md">
                        <label className="pm-label">Alternate Phone</label>
                        <input
                            className="pm-input"
                            type="tel"
                            value={formData.alternatePhone}
                            onChange={(e) => onFieldChange('alternatePhone', e.target.value)}
                            placeholder="10-digit number"
                            maxLength={10}
                        />
                    </div>

                    <div className="pm-field pm-field--md">
                        <label className="pm-label">Personal Email</label>
                        <input
                            className="pm-input"
                            type="email"
                            value={formData.personalEmail}
                            onChange={(e) => onFieldChange('personalEmail', e.target.value)}
                            placeholder="personal@email.com"
                        />
                    </div>
                </div>

                <div className="pm-divider" />
                <div className="pm-field-section-label">Emergency Contact</div>

                <div className="pm-form-grid">
                    <div className="pm-field pm-field--md">
                        <label className="pm-label">Contact Name</label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.emergencyContactName}
                            onChange={(e) => onFieldChange('emergencyContactName', e.target.value)}
                            placeholder="Full name"
                        />
                    </div>

                    <div className="pm-field pm-field--md">
                        <label className="pm-label">Relationship</label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.emergencyContactRelationship}
                            onChange={(e) => onFieldChange('emergencyContactRelationship', e.target.value)}
                            placeholder="e.g. Father, Spouse"
                        />
                    </div>

                    <div className="pm-field pm-field--phone">
                        <label className="pm-label">Contact Number</label>
                        <div className="pm-phone-row">
                            <div className="pm-phone-code">
                                <CountryCodeSelect
                                    value={formData.emergencyContactCountryCode}
                                    onChange={(e) => onFieldChange('emergencyContactCountryCode', e.target.value)}
                                />
                            </div>
                            <input
                                className="pm-input pm-phone-number"
                                type="tel"
                                value={formData.emergencyContactNumber}
                                onChange={(e) => onFieldChange('emergencyContactNumber', e.target.value)}
                                placeholder="10-digit number"
                                maxLength={10}
                            />
                        </div>
                    </div>

                    <div className="pm-field pm-field--md">
                        <label className="pm-label">Contact Email</label>
                        <input
                            className="pm-input"
                            type="email"
                            value={formData.emergencyContactEmail}
                            onChange={(e) => onFieldChange('emergencyContactEmail', e.target.value)}
                            placeholder="email@example.com"
                        />
                    </div>
                </div>

                <div className="pm-divider" />
                <div className="pm-field-section-label">Home Address</div>

                <div className="pm-form-grid">
                    <div className="pm-field pm-field--md">
                        <label className="pm-label">Flat / House No.</label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.addressFlat}
                            onChange={(e) => onFieldChange('addressFlat', e.target.value)}
                            placeholder="Apt / Floor / Unit"
                        />
                    </div>
                    <div className="pm-field pm-field--lg">
                        <label className="pm-label">Area / Street</label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.addressArea}
                            onChange={(e) => onFieldChange('addressArea', e.target.value)}
                            placeholder="Street name or locality"
                        />
                    </div>
                    <div className="pm-field pm-field--md">
                        <label className="pm-label">City</label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.addressCity}
                            onChange={(e) => onFieldChange('addressCity', e.target.value)}
                            placeholder="City"
                        />
                    </div>
                    <div className="pm-field pm-field--md">
                        <label className="pm-label">State</label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.addressState}
                            onChange={(e) => onFieldChange('addressState', e.target.value)}
                            placeholder="State"
                        />
                    </div>
                    <div className="pm-field pm-field--sm">
                        <label className="pm-label">Pincode</label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.addressPincode}
                            onChange={(e) => onFieldChange('addressPincode', e.target.value)}
                            placeholder="6 digits"
                            maxLength={6}
                        />
                    </div>

                    <div className="pm-field pm-field--date">
                        <label className="pm-label">Marriage Date</label>
                        <DateSelectInput
                            value={formData.marriageDate}
                            onChange={(val) => onFieldChange('marriageDate', val)}
                        />
                    </div>
                    <div className="pm-field pm-field--md">
                        <label className="pm-label">Interests</label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.interests}
                            onChange={(e) => onFieldChange('interests', e.target.value)}
                            placeholder="e.g. Reading, Music, Sports"
                        />
                    </div>
                    <div className="pm-field pm-field--lg">
                        <label className="pm-label">Hobbies</label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.hobbies}
                            onChange={(e) => onFieldChange('hobbies', e.target.value)}
                            placeholder="e.g. Photography, Cooking, Travel"
                        />
                    </div>
                </div>
            </div>

            {/* ── Identity & Bank ──────────────────────────────── */}
            <div className="pm-card">
                <div className="pm-card-header">
                    <SectionIcon>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M2 10h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </SectionIcon>
                    <div>
                        <h3 className="pm-card-title">Identity &amp; Bank Information</h3>
                        <p className="pm-card-subtitle">Only payroll administrators can see these details.</p>
                    </div>
                </div>

                <div className="pm-security-banner">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Encrypted and securely stored. Visible only to payroll admins.</span>
                </div>

                <div className="pm-form-grid">
                    <div className="pm-field pm-field--md">
                        <label className="pm-label">
                            Aadhaar Number
                            <span className="pm-field-hint">12 digits</span>
                        </label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.aadhaarNumber}
                            onChange={(e) => onFieldChange('aadhaarNumber', e.target.value)}
                            placeholder="XXXX XXXX XXXX"
                            maxLength={12}
                        />
                    </div>
                    <div className="pm-field pm-field--md">
                        <label className="pm-label">
                            PAN Card Number
                            <span className="pm-field-hint">10 characters</span>
                        </label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.panCardNumber}
                            onChange={(e) => onFieldChange('panCardNumber', e.target.value.toUpperCase())}
                            placeholder="ABCDE1234F"
                            maxLength={10}
                        />
                    </div>
                    <div className="pm-field pm-field--md">
                        <label className="pm-label">Bank Name</label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.bankName}
                            onChange={(e) => onFieldChange('bankName', e.target.value)}
                            placeholder="e.g. State Bank of India"
                        />
                    </div>
                    <div className="pm-field pm-field--lg">
                        <label className="pm-label">Account Number</label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.accountNumber}
                            onChange={(e) => onFieldChange('accountNumber', e.target.value)}
                            placeholder="Account number"
                        />
                    </div>
                    <div className="pm-field pm-field--md">
                        <label className="pm-label">
                            IFSC Code
                            <span className="pm-field-hint">11 characters</span>
                        </label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.ifscCode}
                            onChange={(e) => onFieldChange('ifscCode', e.target.value.toUpperCase())}
                            placeholder="SBIN0001234"
                            maxLength={11}
                        />
                    </div>
                    <div className="pm-field pm-field--md">
                        <label className="pm-label">Branch Name</label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.bankBranch}
                            onChange={(e) => onFieldChange('bankBranch', e.target.value)}
                            placeholder="Branch name"
                        />
                    </div>
                    <div className="pm-field pm-field--md">
                        <label className="pm-label">UAN Number</label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.uanNumber}
                            onChange={(e) => onFieldChange('uanNumber', e.target.value)}
                            placeholder="9–12 digit UAN"
                            maxLength={12}
                        />
                    </div>
                    <div className="pm-field pm-field--md">
                        <label className="pm-label">PF Account Number</label>
                        <input
                            className="pm-input"
                            type="text"
                            value={formData.pfAccountNumber}
                            onChange={(e) => onFieldChange('pfAccountNumber', e.target.value)}
                            placeholder="PF account number"
                        />
                    </div>
                </div>
            </div>

            {/* ── Save Button ──────────────────────────────────── */}
            <div className="pm-actions">
                <button
                    className="pm-save-btn"
                    onClick={onSave}
                    disabled={saving}
                >
                    {saving ? (
                        <>
                            <span className="pm-save-spinner" />
                            Saving…
                        </>
                    ) : (
                        <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                <polyline points="17 21 17 13 7 13 7 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                <polyline points="7 3 7 8 15 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Save Changes
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default ProfileMain;
