import { useCallback, useEffect, useState } from "react";
import { siteRegistryService } from "../../../services/SiteRegistryService";
import type { CreateSiteInput } from "../../../services/SiteRegistryService";
import { persistenceService } from "../../../services/PersistenceService";
import type { Site, SessionRecord } from "../../contracts/domain";

/**
 * useSiteRegistry — catálogo de destinos para app/sites/index.tsx y
 * app/sites/new.tsx. Única puerta de entrada de la pantalla a
 * SiteRegistryService.
 */
export function useSiteRegistry(activeOnly = false) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sites, setSites] = useState<Site[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await siteRegistryService.listSites(activeOnly);
      setSites(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createSite = useCallback(
    async (input: CreateSiteInput) => {
      const created = await siteRegistryService.createSite(input);
      await refresh();
      return created;
    },
    [refresh],
  );

  return { loading, error, sites, refresh, createSite };
}

/**
 * useSiteDetail — ficha de un sitio (app/sites/[id].tsx): datos del
 * destino más el historial de jornadas que lo referencian por `siteId`.
 */
export function useSiteDetail(siteId: string | null) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [visits, setVisits] = useState<SessionRecord[]>([]);

  const refresh = useCallback(async () => {
    if (!siteId) {
      setSite(null);
      setVisits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [found, allSessions] = await Promise.all([
        siteRegistryService.getSite(siteId),
        persistenceService.listSessionRecords({ includeClosed: true }),
      ]);
      setSite(found);
      setVisits(
        allSessions
          .filter((session) => session.siteId === siteId && !session.isDeleted)
          .sort((a, b) => b.declaredStartAtMs - a.declaredStartAtMs),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const archive = useCallback(async () => {
    if (!siteId) return;
    await siteRegistryService.archiveSite(siteId);
    await refresh();
  }, [siteId, refresh]);

  const reactivate = useCallback(async () => {
    if (!siteId) return;
    await siteRegistryService.reactivateSite(siteId);
    await refresh();
  }, [siteId, refresh]);

  const updateRadius = useCallback(
    async (radiusMeters: number) => {
      if (!siteId) return;
      await siteRegistryService.updateSite(siteId, { radiusMeters });
      await refresh();
    },
    [siteId, refresh],
  );

  return { loading, error, site, visits, refresh, archive, reactivate, updateRadius };
}
