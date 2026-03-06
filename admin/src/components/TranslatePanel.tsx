import * as React from 'react';
import { Button, Flex, IconButton, Modal, Typography } from '@strapi/design-system';
import { useNotification, useFetchClient } from '@strapi/strapi/admin';
import { useNavigate } from 'react-router-dom';
import { translateApi } from '../api/translate';
import { Earth, Information } from '@strapi/icons';
import { customLabel, getLocaleName } from '../utils/customLabel';

interface TranslatePanelProps {
    model: string;
    documentId?: string;
    document?: any;
    [key: string]: any;
}

interface TranslatePanelContentProps {
    targetLocales: any[];
    isLoading: boolean;
    translatingLocale: string | null;
    onTranslate: (locale: string) => void;
}

function TranslatePanelContent({
    targetLocales,
    isLoading,
    translatingLocale,
    onTranslate,
}: TranslatePanelContentProps) {
    return (
        <Flex direction="column" alignItems="stretch" gap={2} width="100%">
            <Modal.Root>
                <Flex direction="row" alignItems="center" justifyContent="flex-start" gap={1}>
                    <Typography variant="sigma" textColor="neutral600">
                        {customLabel('Find out more')}
                    </Typography>
                    <Modal.Trigger>
                        <IconButton label={customLabel('Translation info')} variant="ghost" size="S">
                            <Information />
                        </IconButton>
                    </Modal.Trigger>
                </Flex>

                <Modal.Content>
                    <Modal.Header>
                        <Typography tag="h2" variant="beta">
                            {customLabel('How it works')}
                        </Typography>
                    </Modal.Header>
                    <Modal.Body>
                        <Typography>
                            {customLabel('how-it-works-body')
                                .split('\n')
                                .map((line, i) =>
                                    line ? (
                                        <React.Fragment key={i}>
                                            {line}
                                            <br />
                                        </React.Fragment>
                                    ) : (
                                        <br key={i} />
                                    )
                                )}
                        </Typography>
                    </Modal.Body>
                    <Modal.Footer>
                        <Modal.Close>
                            <Button variant="tertiary">{customLabel('Close')}</Button>
                        </Modal.Close>
                    </Modal.Footer>
                </Modal.Content>
            </Modal.Root>

            {targetLocales.map((target) => (
                <Button
                    key={target.code}
                    fullWidth
                    variant="secondary"
                    startIcon={<Earth />}
                    loading={isLoading && translatingLocale === target.code}
                    disabled={isLoading && translatingLocale !== target.code}
                    onClick={() => onTranslate(target.code)}
                    style={{ width: '100%' }}
                >
                    {customLabel('Translate to {locale}', { locale: getLocaleName(target.code) })}
                </Button>
            ))}
        </Flex>
    );
}

// Strapi v5 PanelComponent: a named function that uses hooks directly
// and returns null (to hide panel) or { title, content }.
// Pattern mirrors @strapi/review-workflows Panel implementation.
export function TranslatePanel(props: TranslatePanelProps) {
    const { model, documentId, document } = props;
    const { toggleNotification } = useNotification();
    const fetchClient = useFetchClient();
    const navigate = useNavigate();
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
                    message: customLabel('Translated to {locale} successfully!', { locale: targetLocale }),
                });
                // Reload the current route so the locale switcher reflects the new translation
                navigate(0);
            }
        } catch (err: any) {
            const correlationId = err.response?.data?.correlationId || 'Unknown';
            toggleNotification({
                type: 'danger',
                message: customLabel('Translation failed. Correlation ID: {id}', { id: correlationId }),
            });
            console.error('Translation error:', err);
        } finally {
            setIsLoading(false);
            setTranslatingLocale(null);
        }
    };

    return {
        title: customLabel('AI Translation'),
        content: (
            <TranslatePanelContent
                targetLocales={targetLocales}
                isLoading={isLoading}
                translatingLocale={translatingLocale}
                onTranslate={handleTranslate}
            />
        ),
    };
}
