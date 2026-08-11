import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { belongsToTwentyStandardApp } from 'src/engine/metadata-modules/utils/belongs-to-twenty-standard-app.util';

export const isProtectedFlatFieldMetadata = (
  flatFieldMetadata: FlatFieldMetadata,
): boolean =>
  belongsToTwentyStandardApp(flatFieldMetadata) ||
  flatFieldMetadata.isSystem ||
  flatFieldMetadata.isSystemSideEffect === true;
