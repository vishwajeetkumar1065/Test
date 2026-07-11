// ========================================================================
// 🎯 WHITE-LABEL CONFIGURATION GATEWAY FOR PRINT SHOPS
// ========================================================================

const SITE_CONFIG = {
    // 🔗 Aapka Supabase URL (Bina kisi extra slash ke)
    SUPABASE_URL: "https://irqlvuphoblgjqysteto.supabase.co",
    
    // 🔑 Aapki Supabase Anon/Publishable Key
    SUPABASE_KEY: "sb_publishable_-8iwefgyZfbxfF93ZjcFbw_G09EA3U-",
    
    // 🏪 Store ka naam jo Admin Dashboard par bada-bada dikhega
    STORE_NAME: "Print Shop Admin Control Panel"
};

// Ise global window object mein save kar rahe hain taaki saari HTML files ise use kar sakein
window.SITE_CONFIG = SITE_CONFIG;