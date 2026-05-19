import { useState, useRef, useCallback, useEffect } from 'react';
import { isPdfFile, revokeObjectUrl } from '@/lib/pdf-browser';

export type ToolStatus = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'error' | 'needs_password';

export function usePdfTool() {
    const [status, setStatus] = useState<ToolStatus>('idle');
    const [fileName, setFileName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [progress, setProgress] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    
    const fileRef = useRef<File | null>(null);
    const isCancelledRef = useRef(false);

    useEffect(() => () => revokeObjectUrl(downloadUrl), [downloadUrl]);

    const handleFile = useCallback((file: File, onFileAccepted?: (file: File) => void) => {
        if (!isPdfFile(file)) {
            setErrorMsg('Please upload a PDF.');
            return false;
        }
        fileRef.current = file;
        setFileName(file.name);
        setErrorMsg('');
        setStatus('idle');
        setProgress('');
        setPassword('');
        setDownloadUrl((prev) => {
            revokeObjectUrl(prev);
            return null;
        });
        isCancelledRef.current = false;
        
        if (onFileAccepted) onFileAccepted(file);
        return true;
    }, []);

    const handleCancel = useCallback(() => {
        isCancelledRef.current = true;
    }, []);

    const handlePasswordSubmit = useCallback((pwd: string, onPasswordAccepted?: (pwd: string) => void) => {
        setPassword(pwd);
        setErrorMsg('');
        setStatus('idle'); // Or 'ready' depending on the tool
        if (onPasswordAccepted) onPasswordAccepted(pwd);
    }, []);

    // Helper to extract error message
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleError = useCallback((e: any, defaultMsg: string) => {
        console.error(e);
        if (e && typeof e === 'object') {
            if (e.name === 'PasswordException') {
                setStatus('needs_password');
                setErrorMsg('This PDF is password-protected. Please enter the password.');
                return;
            }
            if (e.message && (e.message.includes('encrypted') || e.message.includes('password'))) {
                setStatus('needs_password');
                setErrorMsg('This PDF is encrypted. Please enter the password.');
                return;
            }
        }
        setErrorMsg(defaultMsg);
        setStatus('error');
    }, []);

    const reset = useCallback(() => {
        fileRef.current = null;
        setFileName('');
        setErrorMsg('');
        setProgress('');
        setStatus('idle');
        setPassword('');
        setDownloadUrl((prev) => {
            revokeObjectUrl(prev);
            return null;
        });
        isCancelledRef.current = false;
    }, []);

    return {
        status, setStatus,
        fileName, setFileName,
        errorMsg, setErrorMsg,
        progress, setProgress,
        downloadUrl, setDownloadUrl,
        password, setPassword,
        fileRef,
        isCancelledRef,
        handleFile,
        handleCancel,
        handlePasswordSubmit,
        handleError,
        reset
    };
}
