'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PhotoUpload } from './PhotoUpload';

export type PresetPickerProps = {
  value: 'two-lines' | 'ring' | 'actin' | 'image';
  onValueChange: (kind: 'two-lines' | 'ring' | 'actin' | 'image') => void;
  onImageLoaded: (imageData: ImageData) => void;
};

export function PresetPicker({ value, onValueChange, onImageLoaded }: PresetPickerProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v as PresetPickerProps['value'])}>
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="two-lines">Two Lines</TabsTrigger>
        <TabsTrigger value="ring">Ring</TabsTrigger>
        <TabsTrigger value="actin">Actin</TabsTrigger>
        <TabsTrigger value="image">Upload Photo</TabsTrigger>
      </TabsList>
      <TabsContent value="two-lines" className="text-sm text-slate-400 p-4">
        Two parallel emitter lines at 50 nm separation — the classic resolution test.
      </TabsContent>
      <TabsContent value="ring" className="text-sm text-slate-400 p-4">
        A 60 nm hollow ring — the apparent diameter of an immunolabelled
        microtubule cross-section (native 25 nm + antibody stack).
      </TabsContent>
      <TabsContent value="actin" className="text-sm text-slate-400 p-4">
        Periodic actin-spectrin scaffold with ~190 nm spacing — recreating Xu et al. 2013.
      </TabsContent>
      <TabsContent value="image">
        <PhotoUpload onImageLoaded={onImageLoaded} />
      </TabsContent>
    </Tabs>
  );
}
