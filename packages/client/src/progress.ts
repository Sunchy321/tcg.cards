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

    es.addEventListener('error', event => {
        console.error('EventSource error:', event);
    });

    es.addEventListener('close', event => {
        console.log('EventSource connection closed');

        if (event.data != null && event.data !== '') {
            console.error('EventSource close error:', event.data);
            throw new Error(event.data);
        }

        es.close();

        onClose?.();
    });
}
