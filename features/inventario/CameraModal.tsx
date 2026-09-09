import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, SwitchCamera } from 'lucide-react';
import { CameraDevice } from '../types';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageSrc: string) => void;
}

const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');

  // Validar soporte de cámara
  const hasCameraSupport = (): boolean => {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  };

  // 1. Initialize Camera (Trigger Permissions)
  const startCamera = useCallback(async (deviceId?: string) => {
    if (!hasCameraSupport()) {
      setError('Tu navegador no soporta acceso a cámara. Por favor usa Chrome, Firefox o Edge.');
      return;
    }

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setError('');

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId 
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
      };

      const newStream = await navigator.mediaDevices!.getUserMedia(constraints);
      setStream(newStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }

      // After successfully getting a stream, enumerate devices (labels are now available)
      if (!deviceId) {
          enumerateDevices();
      }

    } catch (err: any) {
      console.error("Error accessing camera:", err);
      if (err.name === 'NotAllowedError') {
        setError('Permiso de cámara denegado. Por favor, permite el acceso a la cámara.');
      } else if (err.name === 'NotFoundError') {
        setError('No se encontró ninguna cámara en el dispositivo.');
      } else {
        setError('No se pudo acceder a la cámara. Intenta de nuevo.');
      }
    }
  }, [stream]);

  // 2. List Devices
  const enumerateDevices = async () => {
    if (!hasCameraSupport()) return;

    try {
      const deviceList = await navigator.mediaDevices!.enumerateDevices();
      const videoDevices = deviceList
        .filter(device => device.kind === 'videoinput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${d.deviceId.slice(0, 4)}`
        }));
      
      setDevices(videoDevices);
      
      // If we have devices and none selected, set the first one (or the active one from stream)
      if (videoDevices.length > 0 && !selectedDeviceId) {
          const currentStreamId = stream?.getVideoTracks()[0]?.getSettings().deviceId;
          if (currentStreamId) {
              setSelectedDeviceId(currentStreamId);
          } else {
              setSelectedDeviceId(videoDevices[0].deviceId);
          }
      }
    } catch (err) {
      console.error("Error listing devices:", err);
    }
  };

  // Initialize on open
  useEffect(() => {
    if (isOpen) {
      startCamera(); // Start with default to get permissions
    } else {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Switch camera when selection changes manually
  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newId = e.target.value;
      setSelectedDeviceId(newId);
      startCamera(newId);
  };

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageSrc = canvas.toDataURL('image/jpeg', 0.85);
      onCapture(imageSrc);
      onClose();
    }
  };

  if (!isOpen) return null;

  // Show camera not supported message
  if (!hasCameraSupport()) {
    return (
      <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex flex-col justify-center items-center">
        <div className="bg-red-900/30 border border-red-500 rounded-lg p-6 max-w-sm text-center">
          <p className="text-white mb-4">Tu navegador no soporta acceso a cámara.</p>
          <p className="text-gray-300 text-sm mb-6">Por favor usa Chrome, Firefox, Edge o Safari en dispositivos móviles.</p>
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex flex-col justify-center items-center">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/50 to-transparent">
        <div className="text-white font-medium">Take Photo</div>
        <button onClick={onClose} className="text-white p-2 rounded-full hover:bg-white/20">
          <X size={24} />
        </button>
      </div>

      {/* Camera Viewport */}
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black">
        {error ? (
            <div className="text-white text-center p-4">
                <p className="text-red-400 mb-2">{error}</p>
                <button onClick={() => startCamera()} className="px-4 py-2 bg-slate-700 rounded text-sm">Retry</button>
            </div>
        ) : (
            <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 w-full p-6 bg-black/60 backdrop-blur-sm flex flex-col gap-4">
        
        {/* Device Selector */}
        {devices.length > 1 && (
            <div className="flex justify-center">
               <div className="relative">
                 <select 
                    value={selectedDeviceId}
                    onChange={handleDeviceChange}
                    className="appearance-none bg-white/20 text-white border border-white/30 rounded-full pl-10 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                 >
                    {devices.map(d => (
                      <option key={d.deviceId} value={d.deviceId} className="text-black">
                        {d.label}
                      </option>
                    ))}
                 </select>
                 <SwitchCamera className="absolute left-3 top-2.5 text-white w-4 h-4" />
               </div>
            </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-center items-center gap-8 pb-4">
          <button
            onClick={handleCapture}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-transparent hover:bg-white/20 transition-all active:scale-95"
          >
            <div className="w-16 h-16 bg-white rounded-full"></div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraModal;
