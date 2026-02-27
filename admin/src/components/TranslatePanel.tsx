import * as React from 'react';
import { Button, Flex } from '@strapi/design-system';
import { useNotification, useFetchClient } from '@strapi/strapi/admin';
import { translateApi } from '../api/translate';
import { Earth } from '@strapi/icons';

interface TranslatePanelProps {
    model: string;
    documentId?: string;
    document?: any;
    [key: string]: any;
}

// Strapi v5 PanelComponent: a named function that uses hooks directly
// and returns null (to hide panel) or { title, content }.
// Pattern mirrors @strapi/review-workflows Panel implementation.
export function TranslatePanel(props: TranslatePanelProps) {
    const { model, documentId, document } = props;
    const { toggleNotification } = useNotification();
    const fetchClient = useFetchClient();
    const [locales, setLocales] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [translatingLocale, setTranslatingLocale] = React.useState<string | null>(null);

    React.useEffect(() => {
        const fetchLocales = async () => {
            try {
                const data = await translateApi.getLocales(fetchClient);
                setLocales(data || []);
            } catch (err) {
                console.error('Failed to fetch locales', err);
            }
        };
        fetchLocales();
    }, [fetchClient]);

    const defaultLocale = locales.find((l) => l.isDefault)?.code;
    const currentDocLocale = document?.locale || defaultLocale;
    const targetLocales = locales.filter((l) => l.code !== defaultLocale);

    // Don't show panel if: no locales loaded, not on default locale, or no targets
    if (!locales.length || !defaultLocale || currentDocLocale !== defaultLocale || !targetLocales.length) {
        return null;
    }

    const handleTranslate = async (targetLocale: string) => {
        setIsLoading(true);
        setTranslatingLocale(targetLocale);
        try {
            const result = await translateApi.translate(fetchClient, {
                uid: model,
                documentId: documentId || '',
                sourceLocale: currentDocLocale,
                targetLocale,
            });
            if (result?.ok) {
                toggleNotification({
                    type: 'success',
                    message: `Translated to ${targetLocale} successfully!`,
                });
            }
        } catch (err: any) {
            const correlationId = err.response?.data?.correlationId || 'Unknown';
            toggleNotification({
                type: 'danger',
                message: `Translation failed. Correlation ID: ${correlationId}`,
            });
            console.error('Translation error:', err);
        } finally {
            setIsLoading(false);
            setTranslatingLocale(null);
        }
    };

    return {
        title: 'AI Translation',
        content: (
            <Flex direction="column" alignItems="stretch" gap={2}>
                {targetLocales.map((target) => (
                    <Button
                        key={target.code}
                        fullWidth
                        variant="secondary"
                        startIcon={<Earth />}
                        loading={isLoading && translatingLocale === target.code}
                        disabled={isLoading && translatingLocale !== target.code}
                        onClick={() => handleTranslate(target.code)}
                    >
                        Translate to {target.name.toUpperCase()}
                    </Button>
                ))}
            </Flex>
        ),
    };
}
