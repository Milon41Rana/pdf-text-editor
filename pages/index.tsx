
import React, { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface Annotation {
  id: string;
  page: number;
  x: number;
  y: number;
  text: string;
  fontSize: 'small' | 'medium' | 'large';
}

const LoadingSpinner: React.FC = () => (
    <div className="fixed top-0 left-0 w-full h-full bg-gray-900 bg-opacity-50 flex justify-center items-center z-50">
      <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-white"></div>
    </div>
);

const MobileWarning: React.FC = () => (
    <div className="md:hidden fixed top-0 left-0 w-full bg-yellow-400 p-4 text-center z-50">
        <p>For the best experience, please use a desktop browser.</p>
    </div>
);

const PDFViewer: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const annotationContainerRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const savedAnnotations = localStorage.getItem('pdf-annotations');
    if (savedAnnotations) {
      const parsedAnnotations = JSON.parse(savedAnnotations);
      if (parsedAnnotations.length > 0) {
        setAnnotations(parsedAnnotations);
        setHasUnsavedChanges(true);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('pdf-annotations', JSON.stringify(annotations));
    setHasUnsavedChanges(annotations.length > 0);
  }, [annotations]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setLoading(true);
      setPdfFile(file);
      setAnnotations([]);
      await loadPdf(file);
      setLoading(false);
    } else {
      alert('Please select a valid PDF file.');
    }
  };

  const loadPdf = async (file: File) => {
    try {
      const reader = new FileReader();
      await new Promise<void>((resolve, reject) => {
        reader.onload = async (e) => {
          try {
            const typedArray = new Uint8Array(e.target?.result as ArrayBuffer);
            const pdf = await pdfjsLib.getDocument(typedArray).promise;
            setNumPages(pdf.numPages);
            canvasRefs.current = canvasRefs.current.slice(0, pdf.numPages);
            annotationContainerRefs.current = annotationContainerRefs.current.slice(0, pdf.numPages);
    
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = canvasRefs.current[i - 1];
              if (canvas) {
                const context = canvas.getContext('2d');
                if (context) {
                  canvas.height = viewport.height;
                  canvas.width = viewport.width;
                  const renderContext = {
                    canvasContext: context,
                    viewport: viewport,
                  };
                  await page.render(renderContext).promise;
                }
              }
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
    } catch (error) {
      console.error('Error loading PDF:', error);
      alert('Failed to load PDF. The file may be corrupted or invalid.');
      setPdfFile(null);
    }
  };

  const handlePageClick = (pageIndex: number, event: React.MouseEvent<HTMLDivElement>) => {
    const rect = annotationContainerRefs.current[pageIndex]?.getBoundingClientRect();
    if (!rect) return;
    
    if ((event.target as HTMLElement).closest('.annotation-text')) {
        return;
    }

    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      page: pageIndex,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      text: 'Type here...',
      fontSize: 'medium',
    };
    setAnnotations([...annotations, newAnnotation]);
    setSelectedAnnotation(newAnnotation.id);
  };

  const handleAnnotationChange = (id: string, newText: string) => {
    setAnnotations(annotations.map(ann => ann.id === id ? { ...ann, text: newText } : ann));
  };

  const handleDeleteAnnotation = (id: string) => {
    setAnnotations(annotations.filter(ann => ann.id !== id));
  };

  const handleFontSizeChange = (id: string, size: 'small' | 'medium' | 'large') => {
    setAnnotations(annotations.map(ann => ann.id === id ? { ...ann, fontSize: size } : ann));
  };

  const getFontSizeClass = (size: 'small' | 'medium' | 'large') => {
    switch (size) {
      case 'small': return 'text-xs';
      case 'medium': return 'text-base';
      case 'large': return 'text-lg';
    }
  };

  const exportPdf = async () => {
    if (!pdfFile) {
      alert('No PDF file loaded!');
      return;
    }
    
    setLoading(true);

    try {
      const existingPdfBytes = await pdfFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const pages = pdfDoc.getPages();

      const fontSizeMap = { small: 10, medium: 14, large: 18 };

      for (const ann of annotations) {
        const page = pages[ann.page];
        const { height } = page.getSize();
        const y = height - ann.y;

        page.drawText(ann.text, {
          x: ann.x,
          y: y,
          font: helveticaFont,
          size: fontSizeMap[ann.fontSize],
          color: rgb(0, 0, 0),
        });
      }

      const pdfBytes = await pdfDoc.save();

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'edited.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setHasUnsavedChanges(false);

    } catch (error) {
      console.error('Failed to export PDF:', error);
      alert('An error occurred while exporting the PDF.');
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
        {loading && <LoadingSpinner />}
        <MobileWarning />
        <header className="bg-blue-600 text-white p-4 text-center shadow-md">
            <h1 className="text-3xl font-bold">PDF Editor</h1>
        </header>
        <main className="p-4 md:p-8">
            <div className="flex flex-col md:flex-row justify-center items-center mb-6 space-y-4 md:space-y-0 md:space-x-4">
                <label htmlFor="pdf-upload" className={`bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded cursor-pointer ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    Open PDF
                </label>
                <input type="file" onChange={handleFileChange} className="hidden" id="pdf-upload" disabled={loading} />
                <button onClick={exportPdf} className={`bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded ${!pdfFile || loading ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={!pdfFile || loading}>
                    Download Edited PDF
                </button>
            </div>
            <div className="flex flex-col items-center">
                {pdfFile ? (
                    Array.from(new Array(numPages), (el, index) => (
                        <div key={`page_container_${index + 1}`} className="relative mb-4 shadow-lg bg-white" ref={el => annotationContainerRefs.current[index] = el} onClick={(e) => handlePageClick(index, e)}>
                            <canvas ref={el => canvasRefs.current[index] = el} />
                            <div className="absolute top-0 left-0 w-full h-full">
                                {annotations.filter(ann => ann.page === index).map(ann => (
                                    <div
                                        key={ann.id}
                                        className="annotation-text"
                                        style={{ position: 'absolute', left: ann.x, top: ann.y, color: 'black' }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedAnnotation(ann.id);
                                        }}
                                    >
                                        <textarea
                                            value={ann.text}
                                            onChange={(e) => handleAnnotationChange(ann.id, e.target.value)}
                                            className={`bg-transparent border border-dashed border-gray-500 p-1 resize-none ${getFontSizeClass(ann.fontSize)}`}
                                            rows={1}
                                            style={{ minWidth: '50px', minHeight: '20px', overflow: 'hidden' }}
                                        />
                                        {selectedAnnotation === ann.id && (
                                            <div className="absolute top-full left-0 bg-white shadow-md p-1 flex space-x-1 rounded">
                                                <button onClick={() => handleFontSizeChange(ann.id, 'small')} className="text-xs p-1 hover:bg-gray-200 rounded">S</button>
                                                <button onClick={() => handleFontSizeChange(ann.id, 'medium')} className="text-base p-1 hover:bg-gray-200 rounded">M</button>
                                                <button onClick={() => handleFontSizeChange(ann.id, 'large')} className="text-lg p-1 hover:bg-gray-200 rounded">L</button>
                                                <button onClick={() => handleDeleteAnnotation(ann.id)} className="text-red-500 p-1 hover:bg-gray-200 rounded">Del</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center text-gray-500 mt-16">
                        <h2 className="text-2xl font-semibold mb-2">No PDF Loaded</h2>
                        <p>Click "Open PDF" to select a file and start editing.</p>
                    </div>
                )}
            </div>
        </main>
    </div>
  );
};

export default PDFViewer;
