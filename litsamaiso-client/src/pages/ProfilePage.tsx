import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Hash, Loader2, Mail, Save, Upload, User } from 'lucide-react';
import { toast } from 'sonner';
import Button from '../components/ui/button';
import { useAuth } from '../hooks/useAuth';
import {
  mergeProfileIntoUser,
  profileService,
  type UserProfile,
} from '../services/profileService';
import { getApiErrorMessage } from '../utils/apiError';

const fileSizeLimit = 10 * 1024 * 1024;

const getInitials = (name: string) =>
  name
    .split(/[.\s_-]/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

const getDisplayName = (profile: UserProfile | null) =>
  profile?.name || profile?.email?.split('@')[0] || 'User';

const ProfilePage: React.FC = () => {
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    studentCardUrl: '',
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await profileService.getProfile();
        const fallbackName = data.name || data.email.split('@')[0] || '';
        setProfile(data);
        setFormData({
          name: fallbackName,
          email: data.email,
          studentCardUrl: data.studentCardUrl || '',
        });
      } catch (error) {
        toast.error(getApiErrorMessage(error, 'Failed to fetch profile'));
      } finally {
        setLoading(false);
      }
    };

    void fetchProfile();
  }, []);

  const previewProfile = useMemo(
    () =>
      profile
        ? {
            ...profile,
            name: formData.name || profile.name,
            email: formData.email || profile.email,
            studentCardUrl: formData.studentCardUrl || profile.studentCardUrl,
          }
        : null,
    [formData, profile],
  );

  const validateImage = (file: File): boolean => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return false;
    }

    if (file.size > fileSizeLimit) {
      toast.error('File size must be less than 10MB');
      return false;
    }

    return true;
  };

  const handleImageUpload = async (file: File) => {
    if (!validateImage(file)) return;

    setUploadingImage(true);
    try {
      const { url } = await profileService.uploadProfileImage(file);
      const nextFormData = { ...formData, studentCardUrl: url };
      setFormData(nextFormData);

      const updatedProfile = await profileService.updateProfile(nextFormData);
      setProfile(updatedProfile);
      const updatedUser = mergeProfileIntoUser(user, updatedProfile);
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      toast.success('Image uploaded and saved successfully');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to upload image'));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setUpdating(true);

    try {
      const updatedProfile = await profileService.updateProfile(formData);
      setProfile(updatedProfile);
      const updatedUser = mergeProfileIntoUser(user, updatedProfile);
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to update profile'));
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-100 via-blue-50 to-indigo-100 pt-32">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-24">
          <div className="flex items-center gap-3 text-gray-600">
            <Loader2 className="h-6 w-6 animate-spin text-active" />
            <span className="font-medium">Loading profile...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!profile || !previewProfile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-100 via-blue-50 to-indigo-100 pt-32">
        <div className="mx-auto max-w-7xl px-4 py-24 text-center text-red-600">
          Failed to load profile
        </div>
      </div>
    );
  }

  const displayName = getDisplayName(previewProfile);
  const institutionName = previewProfile.institution?.name || 'Botho University';
  const initials = getInitials(displayName);

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-100 via-blue-50 to-indigo-100 px-4 pb-10 pt-32 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex justify-center">
          <div className="relative w-full max-w-lg pt-6">
            <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2">
              <div className="flex h-12 w-16 items-end justify-center rounded-t-lg bg-gray-600 pb-2 shadow-lg">
                <div className="h-3 w-8 rounded-sm bg-gray-700" />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl bg-linear-to-br from-gray-800 to-gray-950 shadow-2xl">
              <div className="p-6 pb-4">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                    <CheckCircle className="h-6 w-6 text-green-400" />
                  </div>
                  <p className="text-sm font-medium text-green-400">
                    Verified {previewProfile.role || 'User'}
                  </p>
                </div>

                <div className="mb-6 flex items-center gap-4">
                  {previewProfile.studentCardUrl ? (
                    <img
                      src={previewProfile.studentCardUrl}
                      alt="Profile"
                      className="h-16 w-16 rounded-full border-2 border-white/20 object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h1 className="truncate text-xl font-bold text-white">
                      {displayName}
                    </h1>
                    <p className="truncate text-sm text-gray-300">
                      {previewProfile.email}
                    </p>
                  </div>
                </div>

                <div className="mb-5">
                  <p className="mb-1 text-sm text-gray-400">Institution</p>
                  <h2 className="text-lg font-semibold text-white">
                    {institutionName}
                  </h2>
                </div>

                <div>
                  <p className="mb-1 text-sm text-gray-400">Student ID</p>
                  <h2 className="text-2xl font-bold tracking-wide text-white">
                    {previewProfile.studentId || 'Unassigned'}
                  </h2>
                </div>
              </div>

              <div className="px-6 pb-6 pt-3">
                <div className="student-card-bg relative overflow-hidden rounded-lg p-4">
                  <div className="absolute inset-0 bg-black/10" />
                  <div className="relative z-10">
                    <div className="mb-5 flex items-center gap-3 border-b border-teal-500/30 pb-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600">
                          <span className="text-xs font-bold text-white">B</span>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-white">
                          {institutionName}
                        </h3>
                        <p className="text-xs text-teal-100">
                          Empowering Dreams, Inspiring Futures
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      {previewProfile.studentCardUrl ? (
                        <img
                          src={previewProfile.studentCardUrl}
                          alt="Student card"
                          className="h-28 w-28 rounded-lg border-4 border-white/20 object-cover"
                        />
                      ) : (
                        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white">
                          {initials}
                        </div>
                      )}

                      <div className="min-w-0 space-y-1 text-sm text-teal-200">
                        <p>
                          Student ID:{' '}
                          <span className="font-mono text-white">
                            {previewProfile.studentId || 'Unassigned'}
                          </span>
                        </p>
                        <p>
                          Full Name:{' '}
                          <span className="text-white">{displayName}</span>
                        </p>
                        <p>
                          Department: <span className="text-white">Computing</span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 border-t border-teal-500/30 pt-2">
                      <p className="text-xs text-teal-100">
                        University No: +266 2224 7500 | Website:
                        lesotho.bothouniversity.com
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl sm:p-8 mt-6">
          <h2 className="mb-6 text-2xl font-bold text-primary-clr">
            Student Information
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <label className="block space-y-2" htmlFor="name">
              <span className="text-sm font-medium text-gray-700">Name</span>
              <span className="relative block">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(event) =>
                    setFormData((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  className="h-11 w-full rounded-lg border border-gray-200 pl-10 pr-3 text-primary-clr outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                  placeholder="Enter your full name"
                  required
                />
              </span>
            </label>

            <label className="block space-y-2" htmlFor="email">
              <span className="text-sm font-medium text-gray-700">Email</span>
              <span className="relative block">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(event) =>
                    setFormData((previous) => ({
                      ...previous,
                      email: event.target.value,
                    }))
                  }
                  className="h-11 w-full rounded-lg border border-gray-200 pl-10 pr-3 text-primary-clr outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                  placeholder="Enter your email"
                  required
                />
              </span>
            </label>

            <label className="block space-y-2" htmlFor="studentId">
              <span className="text-sm font-medium text-gray-700">Student ID</span>
              <span className="relative block">
                <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="studentId"
                  type="text"
                  value={profile.studentId || 'Unassigned'}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-3 text-primary-clr"
                  disabled
                />
              </span>
            </label>

            <div className="space-y-2">
              <span className="text-sm font-medium text-gray-700">
                Profile Image
              </span>
              <div className="rounded-lg border-2 border-dashed border-gray-300 p-5 text-center transition hover:border-gray-400">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleImageUpload(file);
                  }}
                  className="hidden"
                  id="image-upload"
                  disabled={uploadingImage}
                />
                <label
                  htmlFor="image-upload"
                  className="flex cursor-pointer flex-col items-center"
                >
                  <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                    {uploadingImage ? (
                      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    ) : (
                      <Upload className="h-5 w-5 text-gray-400" />
                    )}
                  </span>
                  <span className="text-sm font-medium text-primary-clr">
                    {uploadingImage ? 'Uploading...' : 'Upload image'}
                  </span>
                  <span className="mt-1 text-xs text-gray-500">
                    PNG or JPG, max. 10MB
                  </span>
                </label>
              </div>
            </div>

            <Button
              type="submit"
              disabled={updating || uploadingImage}
              className="h-11 w-full bg-gray-900 text-white hover:bg-gray-800"
            >
              {updating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {updating ? 'Updating...' : 'Update Info'}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default ProfilePage;
