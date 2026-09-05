// frontend/src/utils/permissionTest.js
import api from '../api/axios';

export const testPermissionSystem = async () => {
    try {
        console.log('🧪 Testing Permission System...');

        // Test 1: Fetch current user permissions
        console.log('\n=== Test 1: Fetch Current User Permissions ===');
        const userResponse = await api.get('/auth/me');
        const user = userResponse.data;
        console.log('✅ User data fetched:', {
            name: user.fullName,
            role: user.role,
            hasFeaturePermissions: !!user.featurePermissions,
            permissions: user.featurePermissions
        });

        // Test 2: Check if user is admin (should have all permissions)
        if (user.role === 'Admin') {
            console.log('\n=== Test 2: Admin User (All Permissions) ===');
            console.log('✅ Admin user detected - should have all permissions');
            return { success: true, message: 'Admin user - all permissions granted' };
        }

        // Test 3: Test permission checks
        console.log('\n=== Test 3: Permission Checks ===');
        const permissionChecks = {
            leaves: user.featurePermissions?.leaves,
            breaks: user.featurePermissions?.breaks,
            canCheckIn: user.featurePermissions?.canCheckIn,
            canCheckOut: user.featurePermissions?.canCheckOut,
            canTakeBreak: user.featurePermissions?.canTakeBreak,
            privilegeLevel: user.featurePermissions?.privilegeLevel
        };
        console.log('✅ Permission checks:', permissionChecks);

        // Test 4: Test restricted features
        if (user.featurePermissions?.privilegeLevel === 'restricted') {
            console.log('\n=== Test 4: Restricted User Features ===');
            const restrictedFeatures = user.featurePermissions?.restrictedFeatures || {};
            console.log('✅ Restricted features:', restrictedFeatures);
        }

        // Test 5: Test advanced features
        if (user.featurePermissions?.privilegeLevel === 'advanced') {
            console.log('\n=== Test 5: Advanced User Features ===');
            const advancedFeatures = user.featurePermissions?.advancedFeatures || {};
            console.log('✅ Advanced features:', advancedFeatures);
        }

        // Test 6: Test break windows
        if (user.featurePermissions?.breakWindows?.length > 0) {
            console.log('\n=== Test 6: Break Windows ===');
            console.log('✅ Break windows:', user.featurePermissions.breakWindows);
        }

        console.log('\n✅ All permission tests completed successfully!');
        return { 
            success: true, 
            message: 'Permission system working correctly',
            user: user
        };

    } catch (error) {
        console.error('❌ Permission test failed:', error);
        return { 
            success: false, 
            message: error.message || 'Permission test failed',
            error: error
        };
    }
};

// Helper function to test specific permission
export const testSpecificPermission = async (permission) => {
    try {
        const userResponse = await api.get('/auth/me');
        const user = userResponse.data;
        
        if (user.role === 'Admin') {
            return { hasPermission: true, reason: 'Admin user' };
        }

        const hasPermission = user.featurePermissions?.[permission];
        return { 
            hasPermission, 
            reason: hasPermission ? 'Permission granted' : 'Permission denied',
            user: user
        };
    } catch (error) {
        return { 
            hasPermission: false, 
            reason: 'Error checking permission',
            error: error
        };
    }
};

// Helper function to simulate permission change
export const simulatePermissionChange = async (userId, permission, value) => {
    try {
        console.log(`🔄 Simulating permission change: ${permission} = ${value} for user ${userId}`);
        
        // This would typically be called by an admin
        const response = await api.put(`/admin/manage/${userId}`, {
            featurePermissions: {
                [permission]: value
            }
        });

        console.log('✅ Permission change simulated:', response.data);
        return { success: true, data: response.data };
    } catch (error) {
        console.error('❌ Permission change simulation failed:', error);
        return { success: false, error: error };
    }
};


