'use client';
import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Paper,
  Divider
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import { useGenerate2fa, useTurnOn2fa, useTurnOff2fa, PublicUser, useMe } from '@/hooks/useAuth';

export function TwoFactorSettings({ user }: { user: PublicUser }) {
  const [isTurnOnModalOpen, setIsTurnOnModalOpen] = useState(false);
  const [isTurnOffModalOpen, setIsTurnOffModalOpen] = useState(false);

  const { refetch: refetchMe } = useMe();

  const [setupData, setSetupData] = useState<{ qrCodeUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const generateMutation = useGenerate2fa();
  const turnOnMutation = useTurnOn2fa();
  const turnOffMutation = useTurnOff2fa();

  const handleStartEnable = () => {
    setErrorMsg(null);
    setIsTurnOnModalOpen(true);
    generateMutation.mutate(undefined, {
      onSuccess: (data) => setSetupData(data),
      onError: (err) => setErrorMsg(err.message)
    });
  };

  const handleConfirmEnable = () => {
    setErrorMsg(null);
    turnOnMutation.mutate({ code }, {
      onSuccess: (res) => {
        setBackupCodes(res.backupCodes);
        refetchMe();
      },
      onError: (err) => setErrorMsg(err.message)
    });
  };

  const handleCloseEnable = () => {
    setIsTurnOnModalOpen(false);
    setSetupData(null);
    setCode('');
    setBackupCodes(null);
    setErrorMsg(null);
  };

  const handleConfirmDisable = () => {
    setErrorMsg(null);
    turnOffMutation.mutate({ password, code }, {
      onSuccess: () => {
        setIsTurnOffModalOpen(false);
        setPassword('');
        setCode('');
        refetchMe();
      },
      onError: (err) => setErrorMsg(err.message)
    });
  };

  return (
    <Paper sx={{ p: 3, height: '100%', borderRadius: 3, mt: 4 }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <SecurityIcon color="primary" />
        <Typography variant="h6" fontWeight={600}>
          Sécurité & Authentification
        </Typography>
      </Box>

      <Box display="flex" flexDirection="column" gap={2}>
        <Typography variant="body2" color="text.secondary">
          Protégez votre compte en activant la double authentification (2FA). Cela nécessitera un code généré par votre application (comme Google Authenticator ou Authy) en plus de votre mot de passe lors de la connexion.
        </Typography>

        <Box display="flex" alignItems="center" justifyContent="space-between" mt={2} p={2} bgcolor="action.hover" borderRadius={2}>
          <Typography variant="body1" fontWeight={500}>
            Statut 2FA : {user.isTwoFactorEnabled ? <Typography component="span" color="success.main" fontWeight="bold">Activé</Typography> : <Typography component="span" color="text.secondary">Désactivé</Typography>}
          </Typography>
          {!user.isTwoFactorEnabled ? (
            <Button variant="contained" color="primary" onClick={handleStartEnable}>
              Activer
            </Button>
          ) : (
            <Button variant="outlined" color="error" onClick={() => setIsTurnOffModalOpen(true)}>
              Désactiver
            </Button>
          )}
        </Box>
      </Box>

      {/* Turn On Modal */}
      <Dialog open={isTurnOnModalOpen} onClose={handleCloseEnable} maxWidth="sm" fullWidth>
        <DialogTitle>Activer la double authentification</DialogTitle>
        <DialogContent dividers>
          {errorMsg && <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>}

          {backupCodes ? (
            <Box>
              <Alert severity="success" sx={{ mb: 3 }}>
                Double authentification activée avec succès !
              </Alert>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom color="error.main">
                ⚠️ C&apos;est la seule fois que ces codes de secours seront affichés.
              </Typography>
              <Typography variant="body2" mb={2}>
                Veuillez les copier et les conserver dans un endroit sûr (comme un gestionnaire de mots de passe). Ils vous permettront de vous connecter si vous perdez l&apos;accès à votre application d&apos;authentification.
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1}>
                  {backupCodes.map((bc, i) => (
                    <Typography key={i} variant="body2" fontFamily="monospace" fontWeight="bold">
                      {bc}
                    </Typography>
                  ))}
                </Box>
              </Paper>
            </Box>
          ) : generateMutation.isPending ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : setupData ? (
            <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
              <Typography variant="body2" textAlign="center">
                1. Scannez ce QR Code avec votre application d&apos;authentification (Google Authenticator, Authy, etc.).
              </Typography>
              <Box component="img" src={setupData.qrCodeUrl} alt="QR Code 2FA" sx={{ width: 200, height: 200, borderRadius: 2, border: '1px solid', borderColor: 'divider' }} />
              <Typography variant="caption" color="text.secondary">
                Ou utilisez la clé secrète manuellement : <Typography component="span" fontFamily="monospace" fontWeight="bold">{setupData.secret}</Typography>
              </Typography>

              <Divider sx={{ width: '100%', my: 2 }} />

              <Typography variant="body2" textAlign="center" mb={1}>
                2. Saisissez le code à 6 chiffres généré par l&apos;application pour confirmer l&apos;activation.
              </Typography>
              <TextField
                label="Code à 6 chiffres"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                fullWidth
                inputProps={{ maxLength: 6 }}
                autoComplete="off"
              />
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          {!backupCodes && (
            <>
              <Button onClick={handleCloseEnable} color="inherit" disabled={turnOnMutation.isPending}>Annuler</Button>
              <Button
                onClick={handleConfirmEnable}
                variant="contained"
                disabled={code.length < 6 || turnOnMutation.isPending}
              >
                {turnOnMutation.isPending ? 'Activation...' : 'Confirmer'}
              </Button>
            </>
          )}
          {backupCodes && (
            <Button onClick={handleCloseEnable} variant="contained" color="primary">J&apos;ai sauvegardé mes codes</Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Turn Off Modal */}
      <Dialog open={isTurnOffModalOpen} onClose={() => { setIsTurnOffModalOpen(false); setErrorMsg(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>Désactiver la double authentification</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" mb={3}>
            Pour des raisons de sécurité, veuillez renseigner votre mot de passe actuel ainsi qu&apos;un code 2FA valide pour désactiver cette protection.
          </Typography>
          {errorMsg && <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>}
          <TextField
            label="Mot de passe"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            margin="normal"
          />
          <TextField
            label="Code 2FA ou code de secours"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            fullWidth
            margin="normal"
            inputProps={{ maxLength: 10 }}
            autoComplete="off"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsTurnOffModalOpen(false)} color="inherit" disabled={turnOffMutation.isPending}>Annuler</Button>
          <Button
            onClick={handleConfirmDisable}
            variant="contained"
            color="error"
            disabled={!password || code.length < 6 || turnOffMutation.isPending}
          >
            {turnOffMutation.isPending ? 'Désactivation...' : 'Désactiver'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
