// Cookie helpers
function setCookie(name, value, days = 365) {
    const expires = new Date(Date.now() + days*24*60*60*1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' +
        name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
}

// Toggle submit button based on input length
function toggleSubmitButton() {
    const input = document.querySelector('.nameInput');
    const btn = document.querySelector('.submitButton');
    btn.disabled = input.value.trim().length === 0;
}

// Load user details and populate input
async function loadUserInfo() {
    const token = getCookie('authToken');
    const url = `${window.API_URLS.USER}info/`; // Adjust endpoint if needed

    if (!token) {
        toggleSubmitButton();
        return;
    }

    try {
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        if (res.ok) {
            const user = await res.json();
            const input = document.querySelector('.nameInput');
            input.value = user.name || '';
        } else {
            printError('Failed to fetch user info:', res.status);
        }
    } catch (err) {
        printError('Error fetching user info:', err);
    } finally {
        toggleSubmitButton();
    }
}

async function updateUserInfo(name) {
    const token = getCookie('authToken');
    const url = `${window.API_URLS.USER}update/`;

    if (!token) {
        throw new Error('No authToken found. User not logged in.');
    }

    let res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ name })
    });

    if (res.status === 401) {
        printError('⚠️ Token unauthorized. Deleting credentials and retrying anonymously.');
        deleteCookie('authToken');

        // Retry anonymously
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ name })
        });
    }

    if (!res.ok) {
        throw new Error(`Failed to update user: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (data.success) {
        printl(`✅ Updated fields: ${data.updated.join(', ')}`);

        // Set onboardingComplete cookie if not already set
        const onboardingStatus = getCookie('onboardingComplete');
        if (onboardingStatus !== 'true') {
            setCookie('onboardingComplete', 'true');
            printl('🎉 onboardingComplete cookie set.');
        }
    }

    return data;
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const input = document.querySelector('.nameInput');
    const btn = document.querySelector('.submitButton');

    // Initialize button state and load user data
    toggleSubmitButton();
    loadUserInfo();

    // Enable/disable submit on input change
    input.addEventListener('input', toggleSubmitButton);

    btn.addEventListener('click', async () => {
        const name = input.value.trim();
        if (!name) {
            alert("Name can't be empty, bro.");
            return;
        }

        try {
            await updateUserInfo(name);
            window.location.href = '/home.html'; // Change this to your next route
        } catch (err) {
            printError('❌ Error updating user:', err);
            alert('Something went wrong. Please try again.');
        }
    });
});
