declare module 'html-to-pdfmake' {
    function htmlToPdfmake(html: string, options?: { window?: unknown; [key: string]: unknown }): unknown[];
    export default htmlToPdfmake;
}
