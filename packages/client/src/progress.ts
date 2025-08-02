export function actionWithProgress<T>(
    url: string,
    onProgress: (value: T) => void,
    onClose?: () => void,
): void {
    const es = new EventSource(url);

    es.addEventListener('progress', event => {
        const data = event.data;

        if (data) {
            try {
                const value: T = JSON.parse(data);
                onProgress(value);
            } catch (e) {
                console.error('Error parsing progress data:', e);
            }
        }
    });

    es.addEventListener('close', () => {
        console.log('EventSource connection closed');
        es.close();

        onClose?.();
    });
}
