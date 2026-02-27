const permissions: Array<{ action: string; section: string; displayName: string; uid: string }> = [
    {
        action: 'plugin::hm-ai-strapi-translate.translate',
        section: 'plugins',
        displayName: 'Translate',
        uid: 'translate',
    },
];

export default permissions;
