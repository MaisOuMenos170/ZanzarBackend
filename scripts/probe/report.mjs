/**
 * Texto da issue da sonda. Não inclui coordenada, photo_reference, e-mail nem id.
 */

const PROBE_PLACE_LABEL = "centro de Curitiba";

export function formatProbeReport(result) {
  const lines = [
    "## Sonda da API",
    "",
    `- Health: ${formatCheck(result.health)}`,
    `- Mapa (${PROBE_PLACE_LABEL}): ${formatPlaces(result.places)}`,
    `- Foto: ${formatCheck(result.photo)}`,
  ];
  return lines.join("\n");
}

function formatPlaces(check) {
  if (!check?.ok) {
    return formatCheck(check);
  }
  const count = Number(check.count);
  if (!Number.isInteger(count) || count < 1) {
    return "resposta sem lugares";
  }
  return count === 1 ? "1 lugar na amostra" : `${count} lugares na amostra`;
}

function formatCheck(check) {
  if (check?.ok) {
    return "ok";
  }
  if (typeof check?.status === "number") {
    return `HTTP ${check.status}`;
  }
  return "falhou";
}

/** True when the report text would publish a coordinate, email, or id. */
export function reportLeaksPrivateData(text) {
  return (
    /@/.test(text) ||
    /photo_reference|userId|place_id|latitude|longitude/i.test(text) ||
    /(?:^|[^\d])-?\d+\.\d{3,}/.test(text) ||
    /[?&](?:lat|lng)=/i.test(text)
  );
}
