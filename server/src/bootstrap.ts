import type { Core } from '@strapi/strapi';
import permissions from './permissions';

export default async ({ strapi }: { strapi: Core.Strapi }) => {
  const actions = permissions.map((p) => ({
    section: p.section,
    pluginName: 'hm-ai-strapi-translate',
    displayName: p.displayName,
    uid: p.uid,
  }));
  await strapi.admin.services.permission.actionProvider.registerMany(actions);
};
