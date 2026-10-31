/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { useAppDispatch } from 'src/SqlLab/hooks/useAppDispatch';
import type { SqlLabRootState } from 'src/SqlLab/types';
import useQueryEditor from 'src/SqlLab/hooks/useQueryEditor';
import { addTable, removeTables } from 'src/SqlLab/actions/sqlLab';
import {
  getItem,
  setItem,
  LocalStorageKeys,
} from 'src/utils/localStorageHelpers';
import { ViewLocations } from 'src/SqlLab/contributions';
import SharedTableExploreTree from 'src/components/TableExploreTree';

type Props = {
  queryEditorId: string;
};

const getPinnedSchemasStorageKey = (
  dbId: number | undefined,
  catalog: string | null | undefined,
): string => `${dbId ?? ''}:${catalog ?? ''}`;

const getPinnedSchemasFromStorage = (
  dbId: number | undefined,
  catalog: string | null | undefined,
): Set<string> => {
  if (!dbId) return new Set();
  const stored = getItem(LocalStorageKeys.SqllabPinnedSchemas, {});
  const key = getPinnedSchemasStorageKey(dbId, catalog);
  const schemas = stored[key];
  return Array.isArray(schemas) ? new Set<string>(schemas) : new Set();
};

const savePinnedSchemasToStorage = (
  dbId: number | undefined,
  catalog: string | null | undefined,
  schemas: Set<string>,
) => {
  if (!dbId) return;
  const stored = getItem(LocalStorageKeys.SqllabPinnedSchemas, {});
  const key = getPinnedSchemasStorageKey(dbId, catalog);
  setItem(LocalStorageKeys.SqllabPinnedSchemas, {
    ...stored,
    [key]: [...schemas],
  });
};

const TableExploreTree: React.FC<Props> = ({ queryEditorId }) => {
  const dispatch = useAppDispatch();
  const tables = useSelector(
    ({ sqlLab }: SqlLabRootState) => sqlLab.tables,
    shallowEqual,
  );
  const queryEditor = useQueryEditor(queryEditorId, [
    'dbId',
    'catalog',
    'tabViewId',
  ]);
  const { dbId, catalog } = queryEditor;
  const editorId = queryEditor.tabViewId ?? queryEditor.id;
  const pinnedTables = useMemo(
    () =>
      Object.fromEntries(
        tables.map(({ queryEditorId: qeId, dbId: dId, schema, name, persistData }) => [
          editorId === qeId ? `${dId}:${schema}:${name}` : '',
          persistData,
        ]),
      ),
    [tables, editorId],
  );

  const pinnedTableKeys = useMemo(
    () =>
      new Set(
        tables
          .filter(({ queryEditorId: qeId }) => editorId === qeId)
          .map(({ dbId: dId, schema, name }) => `${dId}:${schema}:${name}`),
      ),
    [tables, editorId],
  );

  const handlePinTable = useCallback(
    (tableName: string, schemaName: string, catalogName: string | null) =>
      dispatch(addTable(queryEditor, tableName, catalogName, schemaName)),
    [dispatch, queryEditor],
  );

  const handleUnpinTable = useCallback(
    (tableName: string, schemaName: string) => {
      const table = tables.find(
        t =>
          t.queryEditorId === editorId &&
          t.dbId === dbId &&
          t.schema === schemaName &&
          t.name === tableName,
      );
      if (table) {
        dispatch(removeTables([table]));
      }
    },
    [dispatch, tables, editorId, dbId],
  );

  const [pinnedSchemas, setPinnedSchemas] = useState<Set<string>>(() =>
    getPinnedSchemasFromStorage(dbId, catalog),
  );

  const previousDbIdRef = useRef<number | undefined>(dbId);
  const previousCatalogRef = useRef<string | null | undefined>(catalog);

  useEffect(() => {
    const dbChanged = previousDbIdRef.current !== dbId;
    const catalogChanged = previousCatalogRef.current !== catalog;

    if (dbChanged || catalogChanged) {
      previousDbIdRef.current = dbId;
      previousCatalogRef.current = catalog;
      setPinnedSchemas(getPinnedSchemasFromStorage(dbId, catalog));
      return;
    }

    savePinnedSchemasToStorage(dbId, catalog, pinnedSchemas);
  }, [dbId, catalog, pinnedSchemas]);

  const handlePinSchema = useCallback((schemaName: string) => {
    setPinnedSchemas(prev => new Set([...prev, schemaName]));
  }, []);

  const handleUnpinSchema = useCallback((schemaName: string) => {
    setPinnedSchemas(prev => {
      const next = new Set(prev);
      next.delete(schemaName);
      return next;
    });
  }, []);

  return (
    <SharedTableExploreTree
      dbId={dbId}
      catalog={catalog}
      showColumns
      allowPinning
      pinnedTables={pinnedTables}
      pinnedTableKeys={pinnedTableKeys}
      pinnedSchemas={pinnedSchemas}
      onPinTable={handlePinTable}
      onUnpinTable={handleUnpinTable}
      onPinSchema={handlePinSchema}
      onUnpinSchema={handleUnpinSchema}
      toolbarViewId={ViewLocations.sqllab.leftSidebar}
    />
  );
};

export default TableExploreTree;
