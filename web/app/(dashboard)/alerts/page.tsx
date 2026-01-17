"use client";

import { AlertCenter } from "../../../components/AlertCenter";
import { Box, Container } from "@mui/material";

export default function AlertsPage() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <AlertCenter />
    </Container>
  );
}
