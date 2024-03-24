const innerlyUrls = {
    index: '/',
    // DEV ONLY *change at build time
    home: process.env.REACT_APP_ACTUAL_URL,
    entry: '/session',
    userpage: '/home',
    datapage: '/data',
    prompts: '/prompts',
    settings: '/settings',
    delete: '/x/delete/',
    logout: '/logout',
    adminDash: '/admin',
    'growth': '/admin/growth',
    users: '/admin/users'
}

export default innerlyUrls;