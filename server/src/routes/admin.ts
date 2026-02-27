export default {
  type: 'admin',
  routes: [
    {
      method: 'POST',
      path: '/translate',
      handler: 'translate.translate',
      config: {
        policies: [
          'admin::isAuthenticatedAdmin',
          {
            name: 'admin::hasPermissions',
            config: {
              actions: ['plugin::hm-ai-strapi-translate.translate'],
            },
          },
        ],
      },
    },
  ],
};
