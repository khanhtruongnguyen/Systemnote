/// <reference types="vite/client" />

declare module 'quill' {
  const Quill: any;
  export default Quill;
}

interface Window {
  Quill?: any;
}
