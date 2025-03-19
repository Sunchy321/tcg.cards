declare module 'request-progress' {
    import { Request } from 'request';

    namespace requestProgress {
        interface Progress {
            /**
             * Overall percent (between 0 to 1)
             */
            percent: number;

            /**
             * The download speed in bytes/sec
             */
            speed: number;

            size: {
                /**
                 * The total payload size in bytes
                 */
                total: number;

                /**
                 * The transferred payload size in bytes
                 */
                transferred: number;
            };

            time: {
                /**
                 * The total elapsed seconds since the start (3 decimals)
                 */
                elapsed: number;

                /**
                 * The remaining seconds to finish (3 decimals)
                 */
                remaining: number;
            };
        }

        interface RequestProgress extends Request {
            on(event: string, listener: (...args: any[]) => void): this;
            on(event: 'progress', listener: (progress: Progress) => void): this;
        }
    }

    function requestProgress(request: Request): requestProgress.RequestProgress;

    export = requestProgress;
}
