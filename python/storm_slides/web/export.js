/** Export the entire accepted acquisition, independent of playback position or draft controls. */
export function localizationCsv(experiment) {
  const { localizations: loc, settings, model } = experiment;
  const metadataKeys = Object.keys(settings);
  const columns = [
    "frame_index",
    "x_nm",
    "y_nm",
    "corrected_x_nm",
    "corrected_y_nm",
    "photons",
    "precision_nm",
    "pixel_size_nm",
    "psf_sigma_px",
    "off_probability",
    ...metadataKeys,
  ];
  const lines = [columns.join(",")];
  loc.frame.forEach((frame, i) => {
    const row = [
      frame,
      ...loc.xy[i].map((v) => v * model.pixel_size_nm),
      ...loc.corrected_xy[i].map((v) => v * model.pixel_size_nm),
      loc.photons[i],
      loc.precision_nm[i],
      model.pixel_size_nm,
      model.psf_sigma_px,
      model.off_probability,
      ...metadataKeys.map((key) => settings[key]),
    ];
    lines.push(
      row
        .map((value) =>
          /[",\r\n]/.test(String(value))
            ? `"${String(value).replaceAll('"', '""')}"`
            : String(value),
        )
        .join(","),
    );
  });
  return lines.join("\r\n") + "\r\n";
}
