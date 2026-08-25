import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// Plugin de autenticação local - funciona apenas em dispositivos nativos
const LocalAuthentication = Capacitor.isNativePlatform() 
  ? (Capacitor as any).Plugins?.LocalAuthentication 
  : null;

export interface BiometricOptions {
  reason?: string;
  fallbackTitle?: string;
  cancelTitle?: string;
}

export class BiometricService {
  /**
   * Verifica se o dispositivo suporta autenticação biométrica
   */
  static async isAvailable(): Promise<boolean> {
    try {
      if (!LocalAuthentication) {
        console.log('LocalAuthentication plugin não disponível (web)');
        return false;
      }

      const result = await LocalAuthentication.isAvailable();
      return result.isAvailable || false;
    } catch (error) {
      console.error('Erro ao verificar biometria:', error);
      return false;
    }
  }

  /**
   * Autentica o usuário usando biometria (facial ou digital)
   */
  static async authenticate(options?: BiometricOptions): Promise<boolean> {
    try {
      if (!LocalAuthentication) {
        console.log('Biometria não disponível em ambiente web. Usando fallback.');
        // Em ambiente web, podemos simular ou pedir senha
        return false;
      }

      const defaultOptions: BiometricOptions = {
        reason: 'Autentique-se para acessar o prontuário',
        fallbackTitle: 'Usar senha',
        cancelTitle: 'Cancelar',
        ...options
      };

      const result = await LocalAuthentication.authenticate({
        reason: defaultOptions.reason,
        fallbackTitle: defaultOptions.fallbackTitle,
        cancelTitle: defaultOptions.cancelTitle,
      });

      return result.success || false;
    } catch (error) {
      console.error('Erro na autenticação biométrica:', error);
      return false;
    }
  }

  /**
   * Salva credenciais criptografadas (opcional, para login automático)
   */
  static async saveCredentials(userId: string, token: string): Promise<void> {
    try {
      await Preferences.set({
        key: 'user_credentials',
        value: JSON.stringify({ userId, token, timestamp: Date.now() })
      });
    } catch (error) {
      console.error('Erro ao salvar credenciais:', error);
    }
  }

  /**
   * Recupera credenciais salvas
   */
  static async getCredentials(): Promise<{ userId: string; token: string } | null> {
    try {
      const result = await Preferences.get({ key: 'user_credentials' });
      if (result.value) {
        const credentials = JSON.parse(result.value);
        // Validar se não expirou (ex: 7 dias)
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - credentials.timestamp < sevenDays) {
          return credentials;
        }
      }
      return null;
    } catch (error) {
      console.error('Erro ao recuperar credenciais:', error);
      return null;
    }
  }

  /**
   * Remove credenciais salvas (logout)
   */
  static async clearCredentials(): Promise<void> {
    try {
      await Preferences.remove({ key: 'user_credentials' });
    } catch (error) {
      console.error('Erro ao limpar credenciais:', error);
    }
  }
}
