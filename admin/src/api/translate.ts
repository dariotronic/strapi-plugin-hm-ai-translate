export const translateApi = {
    translate: async (
        fetchClient: any,
        data: { uid: string; documentId: string; sourceLocale: string; targetLocale: string }
    ) => {
        const response = await fetchClient.post('/hm-ai-strapi-translate/translate', data);
        return response.data;
    },
    getLocales: async (fetchClient: any) => {
        const response = await fetchClient.get('/i18n/locales');
        return response.data;
    },
};
