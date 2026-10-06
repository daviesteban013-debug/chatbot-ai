"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { MAX_FILE_BYTES, MAX_ATTACHMENTS, FILE_ACCEPT, fileExtension, type FileSummary, type LibraryFile } from "@/lib/files/types";

export function useJarvisFiles(sessionId: string, enabled: boolean) {
  const [selected, setSelected] = useState<FileSummary[]>([]);
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [library, setLibrary] = useState<LibraryFile[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0), uploading = useRef(false), abort = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const current = epoch.current;
    try {
      const response = await fetch(`/api/jarvis/files?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      const data = await response.json();
      if (current !== epoch.current) return;
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar los archivos.");
      setFiles(data.files);
      setLibrary(data.library ?? []);
    } catch (error) { if (current === epoch.current) setError((error as Error).message); }
  }, [enabled, sessionId]);
  const invalidate = useCallback(() => { epoch.current++; abort.current?.abort(); }, []);
  useEffect(() => {
    epoch.current++;
    const timer = setTimeout(() => { setSelected([]); setFiles([]); setLibrary([]); setError(null); setPending(false); void refresh(); }, 0);
    return () => { clearTimeout(timer); invalidate(); };
  }, [refresh, invalidate]);
  const upload = useCallback(async (input: FileList | File[]) => {
    if (!enabled || uploading.current) return;
    const incoming = Array.from(input);
    if (selected.length + incoming.length > MAX_ATTACHMENTS) { setError("Adjunta hasta tres archivos por mensaje."); return; }
    for (const file of incoming) {
      if (!file.size || file.size > MAX_FILE_BYTES) { setError(`${file.name}: el archivo debe pesar hasta 3 MB y tener contenido.`); return; }
      if (!FILE_ACCEPT.split(",").includes(`.${fileExtension(file.name)}`)) { setError("Formatos disponibles: PDF, PNG, JPG, WebP, XLSX, CSV, DOCX, TXT y MD."); return; }
    }
    const current = epoch.current, controller = new AbortController();
    abort.current = controller; uploading.current = true; setPending(true); setError(null);
    try {
      for (const file of incoming) {
        const response = await fetch("/api/jarvis/files", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }, body: file, signal: controller.signal });
        const data = await response.json();
        if (current !== epoch.current) return;
        if (!response.ok) throw new Error(data.error || "No se pudo cargar el archivo.");
        setSelected(previous => [...previous, data.file]);
        setLibrary(previous => [{ ...data.file, sessionId: null }, ...previous]);
      }
    } catch (error) { if (current === epoch.current && !controller.signal.aborted) setError((error as Error).message); }
    finally { uploading.current = false; if (current === epoch.current) setPending(false); }
  }, [enabled, selected.length]);
  const remove = useCallback(async (id: string) => {
    const current = epoch.current; setError(null);
    try {
      const response = await fetch(`/api/jarvis/files?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo eliminar el archivo.");
      if (current !== epoch.current) return;
      setSelected(previous => previous.filter(file => file.id !== id)); setFiles(previous => previous.filter(file => file.id !== id));
      setLibrary(previous => previous.filter(file => file.id !== id));
    } catch (error) { if (current === epoch.current) setError((error as Error).message); }
  }, []);
  const submitted = useCallback(() => { setSelected([]); void refresh(); }, [refresh]);
  const reprocess = useCallback(async (id: string) => {
    if (!enabled || uploading.current) return;
    const current = epoch.current, controller = new AbortController();
    abort.current = controller; uploading.current = true; setPending(true); setError(null);
    try {
      const response = await fetch(`/api/jarvis/files/${id}/ocr`, { method: "POST", signal: controller.signal });
      const data = await response.json();
      if (current !== epoch.current) return;
      if (!response.ok) throw new Error(data.error || "No se pudo leer el archivo.");
      const replace = (files: FileSummary[]) => files.map(file => file.id === id ? data.file : file);
      setSelected(replace); setFiles(replace);
      setLibrary(previous => previous.map(file => file.id === id ? { ...file, ...data.file } : file));
    } catch (error) { if (current === epoch.current && !controller.signal.aborted) setError((error as Error).message); }
    finally { uploading.current = false; if (current === epoch.current) setPending(false); }
  }, [enabled]);
  const select = useCallback((file: LibraryFile) => {
    if (file.sessionId || selected.some(item => item.id === file.id)) return;
    if (selected.length >= MAX_ATTACHMENTS) { setError("Adjunta hasta tres archivos por mensaje."); return; }
    setSelected(previous => [...previous, file]); setError(null);
  }, [selected]);
  return { selected, files, library: library.filter(file => file.sessionId !== sessionId && !selected.some(item => item.id === file.id)), pending, error, upload, remove, select, reprocess, submitted, refresh };
}
