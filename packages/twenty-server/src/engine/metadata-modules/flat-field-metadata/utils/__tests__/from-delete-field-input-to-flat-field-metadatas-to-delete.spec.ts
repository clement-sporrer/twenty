import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from 'twenty-shared/application';
import { FieldMetadataType } from 'twenty-shared/types';

import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import {
  FieldMetadataException,
  FieldMetadataExceptionCode,
} from 'src/engine/metadata-modules/field-metadata/field-metadata.exception';
import {
  getFlatFieldMetadataMock,
  getStandardFlatFieldMetadataMock,
} from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { fromDeleteFieldInputToFlatFieldMetadatasToDelete } from 'src/engine/metadata-modules/flat-field-metadata/utils/from-delete-field-input-to-flat-field-metadatas-to-delete.util';

const buildFlatFieldMetadataMaps = (
  fields: ReturnType<typeof getFlatFieldMetadataMock>[],
) =>
  fields.reduce(
    (maps, field) =>
      addFlatEntityToFlatEntityMapsOrThrow({
        flatEntity: field,
        flatEntityMaps: maps,
      }),
    createEmptyFlatEntityMaps(),
  );

const buildFlatObjectMetadataMaps = (objectId: string) => {
  const flatObject = getFlatObjectMetadataMock({
    universalIdentifier: objectId,
    id: objectId,
  });

  return addFlatEntityToFlatEntityMapsOrThrow({
    flatEntity: flatObject,
    flatEntityMaps: createEmptyFlatEntityMaps(),
  });
};

describe('fromDeleteFieldInputToFlatFieldMetadatasToDelete', () => {
  it('should throw FIELD_METADATA_NOT_FOUND when field does not exist', () => {
    expect(() =>
      fromDeleteFieldInputToFlatFieldMetadatasToDelete({
        deleteOneFieldInput: { id: 'non-existent-id' },
        flatFieldMetadataMaps: buildFlatFieldMetadataMaps([]),
        flatObjectMetadataMaps: buildFlatObjectMetadataMaps('obj-1'),
        flatIndexMaps: createEmptyFlatEntityMaps(),
      }),
    ).toThrow(
      expect.objectContaining({
        code: FieldMetadataExceptionCode.FIELD_METADATA_NOT_FOUND,
      }),
    );
  });

  it('should throw FIELD_MUTATION_NOT_ALLOWED when deleting a standard field', () => {
    const objectId = 'obj-1';
    const standardField = getStandardFlatFieldMetadataMock({
      universalIdentifier: 'standard-field-uid',
      objectMetadataId: objectId,
      type: FieldMetadataType.TEXT,
      name: 'jobTitle',
    });

    expect(() =>
      fromDeleteFieldInputToFlatFieldMetadatasToDelete({
        deleteOneFieldInput: { id: standardField.id },
        flatFieldMetadataMaps: buildFlatFieldMetadataMaps([standardField]),
        flatObjectMetadataMaps: buildFlatObjectMetadataMaps(objectId),
        flatIndexMaps: createEmptyFlatEntityMaps(),
      }),
    ).toThrow(
      expect.objectContaining({
        code: FieldMetadataExceptionCode.FIELD_MUTATION_NOT_ALLOWED,
      }),
    );
  });

  it('should throw FIELD_MUTATION_NOT_ALLOWED with the field name in message', () => {
    const objectId = 'obj-1';
    const standardField = getStandardFlatFieldMetadataMock({
      universalIdentifier: 'standard-field-uid',
      objectMetadataId: objectId,
      type: FieldMetadataType.TEXT,
      name: 'city',
    });

    expect(() =>
      fromDeleteFieldInputToFlatFieldMetadatasToDelete({
        deleteOneFieldInput: { id: standardField.id },
        flatFieldMetadataMaps: buildFlatFieldMetadataMaps([standardField]),
        flatObjectMetadataMaps: buildFlatObjectMetadataMaps(objectId),
        flatIndexMaps: createEmptyFlatEntityMaps(),
      }),
    ).toThrow(new RegExp('Cannot delete standard field "city"'));
  });

  it('should allow deletion of a custom field', () => {
    const objectId = 'obj-1';
    const customField = getFlatFieldMetadataMock({
      universalIdentifier: 'custom-field-uid',
      objectMetadataId: objectId,
      type: FieldMetadataType.TEXT,
      isCustom: true,
    });

    const result = fromDeleteFieldInputToFlatFieldMetadatasToDelete({
      deleteOneFieldInput: { id: customField.id },
      flatFieldMetadataMaps: buildFlatFieldMetadataMaps([customField]),
      flatObjectMetadataMaps: buildFlatObjectMetadataMaps(objectId),
      flatIndexMaps: createEmptyFlatEntityMaps(),
    });

    expect(result.flatFieldMetadatasToDelete).toContainEqual(
      expect.objectContaining({ id: customField.id }),
    );
  });

  it('should be an instance of FieldMetadataException when rejecting standard field', () => {
    const objectId = 'obj-1';
    const standardField = getStandardFlatFieldMetadataMock({
      universalIdentifier: 'standard-field-uid',
      objectMetadataId: objectId,
      type: FieldMetadataType.TEXT,
      name: 'avatarUrl',
    });

    expect(() =>
      fromDeleteFieldInputToFlatFieldMetadatasToDelete({
        deleteOneFieldInput: { id: standardField.id },
        flatFieldMetadataMaps: buildFlatFieldMetadataMaps([standardField]),
        flatObjectMetadataMaps: buildFlatObjectMetadataMaps(objectId),
        flatIndexMaps: createEmptyFlatEntityMaps(),
      }),
    ).toThrow(FieldMetadataException);
  });

  it('should throw FIELD_MUTATION_NOT_ALLOWED when field belongs to twenty standard app', () => {
    const objectId = 'obj-1';
    const standardAppField = getFlatFieldMetadataMock({
      universalIdentifier: 'standard-app-field-uid',
      objectMetadataId: objectId,
      type: FieldMetadataType.TEXT,
      name: 'standardAppField',
      isCustom: true,
      isSystem: false,
      applicationUniversalIdentifier:
        TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
    });

    expect(() =>
      fromDeleteFieldInputToFlatFieldMetadatasToDelete({
        deleteOneFieldInput: { id: standardAppField.id },
        flatFieldMetadataMaps: buildFlatFieldMetadataMaps([standardAppField]),
        flatObjectMetadataMaps: buildFlatObjectMetadataMaps(objectId),
        flatIndexMaps: createEmptyFlatEntityMaps(),
      }),
    ).toThrow(
      expect.objectContaining({
        code: FieldMetadataExceptionCode.FIELD_MUTATION_NOT_ALLOWED,
      }),
    );
  });

  it('should throw FIELD_MUTATION_NOT_ALLOWED when deleting a morph relation leg whose sibling is a system side effect', () => {
    const hostObjectId = 'obj-1';
    const targetObjectId = 'obj-2';

    const inputLeg = getFlatFieldMetadataMock({
      universalIdentifier: 'input-leg-uid',
      id: 'input-leg-id',
      objectMetadataId: hostObjectId,
      type: FieldMetadataType.MORPH_RELATION,
      name: 'targetCustomObject',
      morphId: 'morph-id-1',
      relationTargetFieldMetadataId: 'forward-input-id',
      relationTargetObjectMetadataId: targetObjectId,
    });
    const protectedSiblingLeg = getFlatFieldMetadataMock({
      universalIdentifier: 'protected-sibling-leg-uid',
      id: 'protected-sibling-leg-id',
      objectMetadataId: hostObjectId,
      type: FieldMetadataType.MORPH_RELATION,
      name: 'targetPerson',
      morphId: 'morph-id-1',
      isSystemSideEffect: true,
      relationTargetFieldMetadataId: 'forward-sibling-id',
      relationTargetObjectMetadataId: targetObjectId,
    });
    const forwardInput = getFlatFieldMetadataMock({
      universalIdentifier: 'forward-input-uid',
      id: 'forward-input-id',
      objectMetadataId: targetObjectId,
      type: FieldMetadataType.RELATION,
      relationTargetFieldMetadataId: inputLeg.id,
      relationTargetObjectMetadataId: hostObjectId,
    });
    const forwardSibling = getFlatFieldMetadataMock({
      universalIdentifier: 'forward-sibling-uid',
      id: 'forward-sibling-id',
      objectMetadataId: targetObjectId,
      type: FieldMetadataType.RELATION,
      relationTargetFieldMetadataId: protectedSiblingLeg.id,
      relationTargetObjectMetadataId: hostObjectId,
    });

    const hostFlatObjectMetadata = getFlatObjectMetadataMock({
      universalIdentifier: hostObjectId,
      id: hostObjectId,
      fieldIds: [inputLeg.id, protectedSiblingLeg.id],
    });

    expect(() =>
      fromDeleteFieldInputToFlatFieldMetadatasToDelete({
        deleteOneFieldInput: { id: inputLeg.id },
        flatFieldMetadataMaps: buildFlatFieldMetadataMaps([
          inputLeg,
          protectedSiblingLeg,
          forwardInput,
          forwardSibling,
        ]),
        flatObjectMetadataMaps: addFlatEntityToFlatEntityMapsOrThrow({
          flatEntity: hostFlatObjectMetadata,
          flatEntityMaps: createEmptyFlatEntityMaps(),
        }),
        flatIndexMaps: createEmptyFlatEntityMaps(),
      }),
    ).toThrow(
      new RegExp(
        'Cannot delete field "targetCustomObject": it would cascade to protected field "targetPerson"',
      ),
    );
  });
});
